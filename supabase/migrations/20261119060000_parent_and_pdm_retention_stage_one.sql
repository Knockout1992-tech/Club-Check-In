-- Stage 1 privacy retention: staged parent inactivity and PDM case anonymisation.
-- Apply after review and verify with a dry run before enabling PDM enforcement.

ALTER TABLE public.retention_policies
  ADD COLUMN IF NOT EXISTS review_period_months integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='retention_policies_review_period_months_check'
      AND conrelid='public.retention_policies'::regclass
  ) THEN
    ALTER TABLE public.retention_policies
      ADD CONSTRAINT retention_policies_review_period_months_check
      CHECK (review_period_months IS NULL OR review_period_months BETWEEN 1 AND 24);
  END IF;
END $$;

ALTER TABLE public.personal_data_requests
  ADD COLUMN IF NOT EXISTS retention_anonymised_at timestamptz;

UPDATE public.retention_policies
SET review_period_months=3,
    policy_version=policy_version+1,
    updated_at=now(),
    updated_by='system_admin'
WHERE policy_key='parent_family_links'
  AND review_period_months IS DISTINCT FROM 3;

UPDATE public.retention_policies
SET retention_value=24,
    retention_unit='months',
    action='anonymise',
    enabled=true,
    enforcement_enabled=false,
    notes='Anonymise identifying case details 24 months after closure. Preserve minimal non-identifying evidence. Open cases and active retention holds are excluded.',
    policy_version=policy_version+1,
    updated_at=now(),
    updated_by='system_admin'
WHERE policy_key='pdm_case_records';

CREATE OR REPLACE FUNCTION public.verify_parent_pin_attempt(p_parent_access_id bigint, p_supplied_hash text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_account public.match_parent_access%rowtype;
  v_attempts integer;
  v_locked_until timestamptz;
BEGIN
  IF p_parent_access_id IS NULL
     OR p_parent_access_id < 1
     OR p_supplied_hash IS NULL
     OR p_supplied_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;

  SELECT *
    INTO v_account
    FROM public.match_parent_access
   WHERE id = p_parent_access_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'account_not_found');
  END IF;

  IF v_account.disabled_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'account_disabled');
  END IF;

  IF v_account.locked_until IS NOT NULL AND v_account.locked_until > now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'account_locked');
  END IF;

  IF v_account.pin_hash IS DISTINCT FROM p_supplied_hash THEN
    v_attempts := coalesce(v_account.failed_attempts, 0) + 1;
    IF v_attempts >= 5 THEN
      v_locked_until := now() + interval '10 minutes';
      UPDATE public.match_parent_access
         SET failed_attempts = 0,
             locked_until = v_locked_until,
             updated_at = now()
       WHERE id = v_account.id;
      RETURN jsonb_build_object('ok', false, 'reason', 'five_failed_attempts');
    END IF;

    UPDATE public.match_parent_access
       SET failed_attempts = v_attempts,
           locked_until = NULL,
           updated_at = now()
     WHERE id = v_account.id;
    RETURN jsonb_build_object('ok', false, 'reason', 'incorrect_pin');
  END IF;

  UPDATE public.match_parent_access
     SET failed_attempts = 0,
         locked_until = NULL,
         updated_at = now()
   WHERE id = v_account.id;

  RETURN jsonb_build_object(
    'ok', true,
    'parent_access_id', v_account.id,
    'parent_name', v_account.parent_name
  );
END;
$function$

CREATE OR REPLACE FUNCTION public.accept_parent_family_invitation(p_token_hash text, p_parent_access_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_invite public.match_parent_family_invitations%rowtype;
  v_parent public.match_parent_access%rowtype;
  v_existing_family_id bigint;
BEGIN
  IF p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$'
     OR p_parent_access_id IS NULL OR p_parent_access_id < 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;

  SELECT * INTO v_invite
    FROM public.match_parent_family_invitations
   WHERE token_hash = p_token_hash
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invitation_not_found');
  END IF;
  IF v_invite.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invitation_revoked');
  END IF;
  IF v_invite.accepted_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invitation_already_used');
  END IF;
  IF v_invite.expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invitation_expired');
  END IF;

  SELECT * INTO v_parent
    FROM public.match_parent_access
   WHERE id = p_parent_access_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'parent_not_found');
  END IF;
  IF v_parent.disabled_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'account_disabled');
  END IF;

  SELECT family_id INTO v_existing_family_id
    FROM public.match_parent_family_members
   WHERE parent_access_id = p_parent_access_id;

  IF v_existing_family_id IS NOT NULL
     AND v_existing_family_id <> v_invite.family_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_linked_to_different_family');
  END IF;

  IF v_existing_family_id IS NULL THEN
    INSERT INTO public.match_parent_family_members
      (family_id, parent_access_id, linked_by_parent_id)
    VALUES
      (v_invite.family_id, p_parent_access_id, p_parent_access_id);
  END IF;

  UPDATE public.match_parent_family_invitations
     SET accepted_at = now(),
         accepted_by_parent_id = p_parent_access_id
   WHERE id = v_invite.id
     AND accepted_at IS NULL
     AND revoked_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation acceptance could not be completed';
  END IF;

  RETURN jsonb_build_object('ok', true, 'family_id', v_invite.family_id);
END;
$function$

CREATE OR REPLACE FUNCTION public.update_personal_data_request(p_system_admin_pin text, p_request_id bigint, p_status text, p_identity_status text, p_authority_status text, p_scope_notes text, p_extension_reason text, p_extension_notified_at timestamp with time zone, p_decision text, p_response_notes text, p_sent_at timestamp with time zone, p_sent_via text, p_completed_at timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_request public.personal_data_requests%rowtype; v_clock timestamptz;
begin
 if not public._verify_system_admin_pin(p_system_admin_pin) then return null; end if;
 if p_status not in ('received','awaiting_identity','awaiting_authority','in_review','extension_notified','ready_to_send','completed','partially_completed','refused','withdrawn')
  or p_identity_status not in ('unverified','verified','more_information_required','not_applicable')
  or p_authority_status not in ('not_applicable','unverified','verified','not_authorised') then
  return jsonb_build_object('success',false,'message','Invalid request status or verification state.');
 end if;
 select * into v_request from public.personal_data_requests where id=p_request_id for update;
 if not found then return jsonb_build_object('success',false,'message','Request not found.'); end if;
 if v_request.sent_at is not null or p_sent_at is not null or p_status in ('completed','partially_completed','refused') or p_completed_at is not null then
  return jsonb_build_object('success',false,'message','Final outcomes must use the validated Record response workflow.'); end if;
 if v_request.extension_notified_at is not null and (p_extension_notified_at is distinct from v_request.extension_notified_at or p_extension_reason is distinct from v_request.extension_reason) then
  return jsonb_build_object('success',false,'message','An extension notice can only be recorded once and cannot be overwritten.'); end if;
 v_clock:=v_request.clock_started_at;
 if v_clock is null and p_identity_status='verified' and p_authority_status in ('verified','not_applicable') then
   v_clock:=now();
 end if;
 if p_extension_reason is not null and btrim(p_extension_reason)<>'' then
   if v_clock is null or length(btrim(p_extension_reason))<10 or p_extension_notified_at is null
    or p_extension_notified_at>now() or p_extension_notified_at>v_clock+interval '1 month' then
    return jsonb_build_object('success',false,'message','An extension needs a reason and must be notified within the first month after the response clock starts.');
   end if;
 end if;
 update public.personal_data_requests set
  status=p_status,identity_status=p_identity_status,authority_status=p_authority_status,
  clock_started_at=v_clock,
  due_at=case when v_clock is not null then v_clock+interval '1 month' else due_at end,
  scope_notes=nullif(btrim(p_scope_notes),''),
  extension_reason=nullif(btrim(p_extension_reason),''),
  extension_notified_at=p_extension_notified_at,
  extended_due_at=case when p_extension_reason is not null and btrim(p_extension_reason)<>'' then v_clock+interval '3 months' else null end,
  decision=nullif(btrim(p_decision),''),response_notes=nullif(btrim(p_response_notes),''),
  sent_at=p_sent_at,sent_via=nullif(btrim(p_sent_via),''),completed_at=case when p_status='withdrawn' then coalesce(v_request.completed_at,now()) else p_completed_at end,
  erasure_reviewed_at=null,erasure_reviewed_by=null,erasure_review_notes=null,erasure_review_confirmed=false,updated_at=now()
 where id=p_request_id returning * into v_request;
 if v_request.request_type='erasure' and v_request.erasure_executed_at is not null
  and p_status='completed' and p_sent_at is not null then
  update public.personal_data_requests set subject_name=null,subject_reference=null,subject_locator='{}'::jsonb,
   requester_name=null,contact_details=null,scope_notes=null,response_notes=null,decision='erasure_completed'
  where id=p_request_id;
  v_request.subject_name:=null;v_request.subject_reference:=null;v_request.subject_locator:='{}'::jsonb;
  v_request.requester_name:=null;v_request.contact_details:=null;
 end if;
 insert into public.system_admin_audit_log(source_system,severity,event_type,outcome,actor_type,request_id,details)
 values('club_check_in','info','personal_data_request_updated','success','system_admin',v_request.request_ref,
  jsonb_build_object('status',v_request.status,'identity_status',v_request.identity_status,
   'authority_status',v_request.authority_status,'clock_started_at',v_request.clock_started_at,
   'sent_at',v_request.sent_at,'completed_at',v_request.completed_at));
 return jsonb_build_object('success',true,'request_ref',v_request.request_ref,'status',v_request.status,
  'due_at',v_request.due_at,'extended_due_at',v_request.extended_due_at,'clock_started_at',v_request.clock_started_at);
end;
$function$

CREATE OR REPLACE FUNCTION public.list_personal_data_requests(p_system_admin_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_rows jsonb;
begin
 if not public._verify_system_admin_pin(p_system_admin_pin) then return null; end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.received_at desc),'[]'::jsonb) into v_rows
 from (select id,request_ref,request_type,subject_type,subject_name,requester_name,requester_relationship,
  received_at,due_at,extended_due_at,identity_status,authority_status,status,decision,sent_at,sent_via,completed_at,erasure_executed_at,erasure_records_removed,updated_at,
  coalesce(completed_at,sent_at,case when status='withdrawn' then updated_at else null end) as closed_at
  from public.personal_data_requests order by received_at desc limit 100) x;
 return jsonb_build_object('success',true,'requests',v_rows);
end;$function$

CREATE OR REPLACE FUNCTION public.update_parent_retention_review_period(system_admin_pin text, requested_review_period_months integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  old_value integer;
BEGIN
  IF NOT public._verify_system_admin_pin(system_admin_pin) THEN
    RETURN NULL;
  END IF;
  IF requested_review_period_months IS NULL OR requested_review_period_months < 1 OR requested_review_period_months > 24 THEN
    RAISE EXCEPTION 'Review period must be between 1 and 24 months';
  END IF;
  SELECT review_period_months INTO old_value
  FROM public.retention_policies
  WHERE policy_key='parent_family_links'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent retention policy not found';
  END IF;
  UPDATE public.retention_policies
  SET review_period_months=requested_review_period_months,
      policy_version=policy_version+1,
      updated_at=now(),
      updated_by='system_admin'
  WHERE policy_key='parent_family_links';
  INSERT INTO public.system_admin_audit_log(source_system,severity,event_type,outcome,actor_type,details)
  VALUES('club_check_in','info','parent_retention_review_period_updated','success','system_admin',
    jsonb_build_object('old_review_period_months',old_value,'new_review_period_months',requested_review_period_months));
  RETURN jsonb_build_object('success',true,'review_period_months',requested_review_period_months);
END;
$function$;
CREATE OR REPLACE FUNCTION public.run_retention_job(p_mode text DEFAULT 'scheduled'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_run_id bigint;
  v_mode text := case when p_mode = 'dry_run' then 'dry_run' else 'enforcement' end;
  v_policy jsonb;
  v_checked integer;
  v_affected integer;
  v_second_count integer;
  v_match_months integer;
  v_cancel_months integer;
  v_security_months integer;
  v_parent_portal_months integer;
  v_parent_portal_checked integer;
  v_parent_portal_deleted integer;
  v_completed_seasons integer;
  v_parent_months integer;
  v_parent_review_months integer;
  v_parent_review_checked integer := 0;
  v_parent_review_disabled integer := 0;
  v_pdm_months integer;
  v_pdm_checked integer := 0;
  v_pdm_anonymised integer := 0;
  v_enforce_pdm boolean := false;
  v_archive_seasons integer;
  v_details jsonb;
  v_summary jsonb := '{}'::jsonb;
  v_status text := 'succeeded';
  v_cutoff date;
  v_parent record;
  v_family_id bigint;
  v_remaining bigint;
  v_owner_id bigint;
  v_deleted_parents integer := 0;
  v_anonymised_children integer := 0;
  v_enforce_parent boolean := false;
  v_enforce_archive boolean := false;
begin
  if p_mode not in ('dry_run','scheduled','enforcement') then
    raise exception 'Invalid retention mode';
  end if;

  select coalesce(jsonb_object_agg(policy_key,
    jsonb_build_object('enabled',enabled,'enforcement_enabled',enforcement_enabled,
      'retention_value',retention_value,'retention_unit',retention_unit,'action',action,
      'policy_version',policy_version)), '{}'::jsonb)
  into v_policy from public.retention_policies;

  insert into public.retention_runs(run_mode,policy_snapshot)
  values (v_mode,v_policy) returning id into v_run_id;

  select coalesce((select retention_value from public.retention_policies where policy_key='attendance_individual'),2) into v_completed_seasons;
  select coalesce((select retention_value from public.retention_policies where policy_key='match_availability'),12) into v_match_months;
  select coalesce((select retention_value from public.retention_policies where policy_key='cancelled_fixture_responses'),12) into v_cancel_months;
  select coalesce((select retention_value from public.retention_policies where policy_key='security_logs'),12) into v_security_months;
  select coalesce((select retention_value from public.retention_policies where policy_key='parent_portal_security_audit'),24) into v_parent_portal_months;
  select coalesce((select retention_value from public.retention_policies where policy_key='parent_family_links'),12) into v_parent_months;
  select coalesce((select review_period_months from public.retention_policies where policy_key='parent_family_links'),3) into v_parent_review_months;
  select coalesce((select retention_value from public.retention_policies where policy_key='pdm_case_records'),24) into v_pdm_months;
  select coalesce((select enabled and enforcement_enabled and action='anonymise' from public.retention_policies where policy_key='pdm_case_records'),false) into v_enforce_pdm;
  select coalesce((select retention_value from public.retention_policies where policy_key='archived_players'),2) into v_archive_seasons;
  select coalesce((select enabled and enforcement_enabled from public.retention_policies where policy_key='parent_family_links'),false) into v_enforce_parent;
  select coalesce((select enabled and enforcement_enabled from public.retention_policies where policy_key='archived_players'),false) into v_enforce_archive;

  -- Attendance: current season plus configured completed seasons remain available.
  select min(start_date) into v_cutoff
  from (
    select start_date, row_number() over(order by start_date desc) rn
    from public.seasons
    where not is_current and start_date is not null
  ) s where rn = v_completed_seasons;

  select count(*) into v_checked
  from public.attendance_records ar
  join public.attendance_registers rg on rg.id=ar.register_id
  join public.seasons se on se.id=rg.season_id
  where v_cutoff is not null and se.start_date < v_cutoff and not exists (select 1 from public.retention_holds h where h.status='active' and h.target_table='attendance_records' and h.target_reference=ar.id::text)
    and not exists (select 1 from public.retention_holds ph
      where ph.status='active' and ph.target_table='players'
        and ph.target_reference=ar.player_id);
  v_affected := 0;
  if v_checked > 0 and p_mode <> 'dry_run' and exists(
    select 1 from public.retention_policies
    where policy_key='attendance_individual' and enabled and enforcement_enabled
  ) then
    delete from public.attendance_records ar using public.attendance_registers rg, public.seasons se
    where ar.register_id=rg.id and rg.season_id=se.id and se.start_date < v_cutoff and not exists (select 1 from public.retention_holds h where h.status='active' and h.target_table='attendance_records' and h.target_reference=ar.id::text)
    and not exists (select 1 from public.retention_holds ph
      where ph.status='active' and ph.target_table='players'
        and ph.target_reference=ar.player_id);
    get diagnostics v_affected = row_count;
  end if;
  insert into public.retention_audit_log(run_id,policy_key,action,records_checked,records_affected,outcome,details)
  values(v_run_id,'attendance_individual','delete',v_checked,v_affected,
    case when v_checked=0 then 'skipped' when p_mode='dry_run' then 'would_process'
         when exists(select 1 from public.retention_policies where policy_key='attendance_individual' and enabled and enforcement_enabled) then 'processed'
         else 'enforcement_disabled' end,
    jsonb_build_object('cutoff_before',v_cutoff,'configured_completed_seasons',v_completed_seasons,
      'note','Aggregate attendance_history and register totals retained'));
  v_summary := v_summary || jsonb_build_object('attendance_checked',v_checked,'attendance_deleted',v_affected);

  -- Match availability: fixture date plus the configured number of months.
  select count(*) into v_checked
  from public.match_availability ma
  join public.match_submissions ms on ms.id=ma.submission_id
  join public.match_fixtures mf on mf.id=ms.fixture_id
  where mf.fixture_date <= current_date - make_interval(months => v_match_months)
    and mf.status <> 'cancelled' and not exists (select 1 from public.retention_holds h where h.status='active' and h.target_table='match_availability' and h.target_reference=ma.id::text)
    and not exists (select 1 from public.retention_holds ph
      where ph.status='active' and ph.target_table='players'
        and ph.target_reference=ma.player_id);
  v_affected := 0;
  if v_checked>0 and p_mode<>'dry_run' and exists(select 1 from public.retention_policies where policy_key='match_availability' and enabled and enforcement_enabled) then
    delete from public.match_availability ma using public.match_submissions ms, public.match_fixtures mf
    where ma.submission_id=ms.id and ms.fixture_id=mf.id
      and mf.fixture_date <= current_date - make_interval(months => v_match_months)
      and mf.status <> 'cancelled' and not exists (select 1 from public.retention_holds h where h.status='active' and h.target_table='match_availability' and h.target_reference=ma.id::text)
    and not exists (select 1 from public.retention_holds ph
      where ph.status='active' and ph.target_table='players'
        and ph.target_reference=ma.player_id);
    get diagnostics v_affected = row_count;
    delete from public.match_submissions ms
    where ms.fixture_id in (select id from public.match_fixtures where fixture_date <= current_date - make_interval(months => v_match_months) and status <> 'cancelled')
      and not exists(select 1 from public.match_availability ma where ma.submission_id=ms.id);
  end if;
  insert into public.retention_audit_log(run_id,policy_key,action,records_checked,records_affected,outcome,details)
  values(v_run_id,'match_availability','delete',v_checked,v_affected,
    case when v_checked=0 then 'skipped' when p_mode='dry_run' then 'would_process'
         when exists(select 1 from public.retention_policies where policy_key='match_availability' and enabled and enforcement_enabled) then 'processed'
         else 'enforcement_disabled' end,
    jsonb_build_object('retention_months',v_match_months));
  v_summary := v_summary || jsonb_build_object('match_availability_checked',v_checked,'match_availability_deleted',v_affected);

  -- Cancelled fixture responses: cancellation timestamp plus configured months.
  select count(*) into v_checked
  from public.match_availability ma
  join public.match_submissions ms on ms.id=ma.submission_id
  join public.match_fixtures mf on mf.id=ms.fixture_id
  where mf.status='cancelled' and mf.cancelled_at is not null
    and mf.cancelled_at <= now() - make_interval(months => v_cancel_months) and not exists (select 1 from public.retention_holds h where h.status='active' and h.target_table='match_availability' and h.target_reference=ma.id::text)
    and not exists (select 1 from public.retention_holds ph
      where ph.status='active' and ph.target_table='players'
        and ph.target_reference=ma.player_id);
  v_affected := 0;
  if v_checked>0 and p_mode<>'dry_run' and exists(select 1 from public.retention_policies where policy_key='cancelled_fixture_responses' and enabled and enforcement_enabled) then
    delete from public.match_availability ma using public.match_submissions ms, public.match_fixtures mf
    where ma.submission_id=ms.id and ms.fixture_id=mf.id
      and mf.status='cancelled' and mf.cancelled_at <= now() - make_interval(months => v_cancel_months) and not exists (select 1 from public.retention_holds h where h.status='active' and h.target_table='match_availability' and h.target_reference=ma.id::text)
    and not exists (select 1 from public.retention_holds ph
      where ph.status='active' and ph.target_table='players'
        and ph.target_reference=ma.player_id);
    get diagnostics v_affected = row_count;
    delete from public.match_submissions ms
    where ms.fixture_id in (select id from public.match_fixtures where status='cancelled' and cancelled_at <= now() - make_interval(months => v_cancel_months))
      and not exists(select 1 from public.match_availability ma where ma.submission_id=ms.id);
  end if;
  insert into public.retention_audit_log(run_id,policy_key,action,records_checked,records_affected,outcome,details)
  values(v_run_id,'cancelled_fixture_responses','delete',v_checked,v_affected,
    case when v_checked=0 then 'skipped' when p_mode='dry_run' then 'would_process'
         when exists(select 1 from public.retention_policies where policy_key='cancelled_fixture_responses' and enabled and enforcement_enabled) then 'processed'
         else 'enforcement_disabled' end,
    jsonb_build_object('retention_months',v_cancel_months,'basis','cancelled_at + configured months'));
  v_summary := v_summary || jsonb_build_object('cancelled_responses_checked',v_checked,'cancelled_responses_deleted',v_affected);

  -- Accepted, revoked and expired invitation tokens are removed immediately.
  select
    (select count(*) from public.match_parent_family_invitations i where (i.accepted_at is not null or i.revoked_at is not null or i.expires_at <= now()) and not exists (select 1 from public.retention_holds h where h.status='active' and h.target_table='match_parent_family_invitations' and h.target_reference=i.id::text)) +
    (select count(*) from public.match_parent_family_invites i where (i.accepted_at is not null or i.revoked_at is not null or i.expires_at <= now()) and not exists (select 1 from public.retention_holds h where h.status='active' and h.target_table='match_parent_family_invites' and h.target_reference=i.id::text))
  into v_checked;
  v_affected := 0;
  if v_checked>0 and p_mode<>'dry_run' and exists(select 1 from public.retention_policies where policy_key='invitation_tokens' and enabled and enforcement_enabled) then
    delete from public.match_parent_family_invitations i where (i.accepted_at is not null or i.revoked_at is not null or i.expires_at <= now()) and not exists (select 1 from public.retention_holds h where h.status='active' and h.target_table='match_parent_family_invitations' and h.target_reference=i.id::text);
    get diagnostics v_affected = row_count;
    delete from public.match_parent_family_invites i where (i.accepted_at is not null or i.revoked_at is not null or i.expires_at <= now()) and not exists (select 1 from public.retention_holds h where h.status='active' and h.target_table='match_parent_family_invites' and h.target_reference=i.id::text);
    get diagnostics v_second_count = row_count;
    v_affected := v_affected + v_second_count;
  end if;
  insert into public.retention_audit_log(run_id,policy_key,action,records_checked,records_affected,outcome,details)
  values(v_run_id,'invitation_tokens','delete',v_checked,v_affected,
    case when v_checked=0 then 'skipped' when p_mode='dry_run' then 'would_process'
         when exists(select 1 from public.retention_policies where policy_key='invitation_tokens' and enabled and enforcement_enabled) then 'processed'
         else 'enforcement_disabled' end,
    jsonb_build_object('note','Only token-bearing invite rows are removed; family membership remains intact'));
  v_summary := v_summary || jsonb_build_object('invitation_rows_checked',v_checked,'invitation_rows_deleted',v_affected);

  -- Club-controlled access-attempt logs use their own configured retention.
  select count(*) into v_checked from public.installation_access_attempts ia where ia.updated_at < now() - make_interval(months => v_security_months) and not exists (select 1 from public.retention_holds h where h.status='active' and h.target_table='installation_access_attempts' and h.target_reference=ia.installation_id);
  v_affected := 0;
  if v_checked>0 and p_mode<>'dry_run' and exists(select 1 from public.retention_policies where policy_key='security_logs' and enabled and enforcement_enabled) then
    delete from public.installation_access_attempts ia where ia.updated_at < now() - make_interval(months => v_security_months) and not exists (select 1 from public.retention_holds h where h.status='active' and h.target_table='installation_access_attempts' and h.target_reference=ia.installation_id);
    get diagnostics v_affected = row_count;
  end if;
  insert into public.retention_audit_log(run_id,policy_key,action,records_checked,records_affected,outcome,details)
  values(v_run_id,'security_logs','delete',v_checked,v_affected,
    case when v_checked=0 then 'skipped' when p_mode='dry_run' then 'would_process'
         when exists(select 1 from public.retention_policies where policy_key='security_logs' and enabled and enforcement_enabled) then 'processed'
         else 'enforcement_disabled' end,
    jsonb_build_object('scope','installation_access_attempts only','retention_months',v_security_months));
  v_summary := v_summary || jsonb_build_object('security_logs_checked',v_checked,'security_logs_deleted',v_affected);

  -- Parent Portal security and access audit events have their own configurable retention period.
  select count(*) into v_parent_portal_checked
  from public.system_admin_audit_log
  where source_system='match_availability_parent_portal' and occurred_at < now() - make_interval(months => v_parent_portal_months) and not exists (select 1 from public.retention_holds h where h.status='active' and h.target_table='system_admin_audit_log' and h.target_reference=system_admin_audit_log.id::text);
  v_parent_portal_deleted := 0;
  if v_parent_portal_checked>0 and p_mode<>'dry_run' and exists(
    select 1 from public.retention_policies
    where policy_key='parent_portal_security_audit' and enabled and enforcement_enabled
  ) then
    delete from public.system_admin_audit_log
    where source_system='match_availability_parent_portal' and occurred_at < now() - make_interval(months => v_parent_portal_months) and not exists (select 1 from public.retention_holds h where h.status='active' and h.target_table='system_admin_audit_log' and h.target_reference=system_admin_audit_log.id::text);
    get diagnostics v_parent_portal_deleted = row_count;
  end if;
  insert into public.retention_audit_log(run_id,policy_key,action,records_checked,records_affected,outcome,details)
  values(v_run_id,'parent_portal_security_audit','delete',v_parent_portal_checked,v_parent_portal_deleted,
    case when v_parent_portal_checked=0 then 'skipped'
         when p_mode='dry_run' then 'would_process'
         when exists(select 1 from public.retention_policies where policy_key='parent_portal_security_audit' and enabled and enforcement_enabled) then 'processed'
         else 'enforcement_disabled' end,
    jsonb_build_object('source_system','match_availability_parent_portal','retention_months',v_parent_portal_months,
      'scope','Parent Portal security and access audit events only'));
  v_summary := v_summary || jsonb_build_object(
    'parent_portal_security_audit_checked',v_parent_portal_checked,
    'parent_portal_security_audit_deleted',v_parent_portal_deleted
  );

  -- Stage 1: disable parent accounts after 12 months without meaningful activity.
  -- The account remains linked to its family during the additional review period.
  select count(*) into v_parent_review_checked
  from public.match_parent_access pa
  where pa.disabled_at is null
    and pa.retention_review_after is null
    and pa.last_activity_at < now() - make_interval(months => v_parent_months)
    and not exists (
      select 1 from public.retention_holds h
      where h.status='active' and h.target_table='match_parent_access'
        and h.target_reference=pa.id::text
    );

  v_parent_review_disabled := 0;
  if v_parent_review_checked>0 and p_mode<>'dry_run' and v_enforce_parent then
    with candidates as materialized (
      select pa.id
      from public.match_parent_access pa
      where pa.disabled_at is null
        and pa.retention_review_after is null
        and pa.last_activity_at < now() - make_interval(months => v_parent_months)
        and not exists (
          select 1 from public.retention_holds h
          where h.status='active' and h.target_table='match_parent_access'
            and h.target_reference=pa.id::text
        )
      order by pa.id
      for update
    ),
    disabled as (
      update public.match_parent_access pa
      set disabled_at=now(),
          retention_review_after=now()+make_interval(months => v_parent_review_months),
          updated_at=now()
      from candidates c
      where pa.id=c.id
      returning pa.id
    ),
    revoked_current_invites as (
      update public.match_parent_family_invitations i
      set revoked_at=now()
      where i.invited_by_parent_id in (select id from disabled)
        and i.accepted_at is null and i.revoked_at is null
        and not exists (
          select 1 from public.retention_holds h
          where h.status='active' and h.target_table='match_parent_family_invitations'
            and h.target_reference=i.id::text
        )
      returning i.id
    ),
    revoked_legacy_invites as (
      update public.match_parent_family_invites i
      set revoked_at=now()
      where i.invited_by_parent_id in (select id from disabled)
        and i.accepted_at is null and i.revoked_at is null
        and not exists (
          select 1 from public.retention_holds h
          where h.status='active' and h.target_table='match_parent_family_invites'
            and h.target_reference=i.id::text
        )
      returning i.id
    ),
    invalidated_edit_tokens as (
      update public.match_submissions ms
      set edit_token_hash=null,
          edit_lock_token_hash=null,
          edit_lock_expires_at=null
      where (
        ms.last_updated_by_parent_id in (select id from disabled)
        or ms.family_id in (
          select pa.family_id from public.match_parent_access pa
          where pa.id in (select id from disabled) and pa.family_id is not null
        )
      )
      returning ms.id
    )
    select count(*) into v_parent_review_disabled from disabled;
  end if;

  insert into public.retention_audit_log(run_id,policy_key,action,records_checked,records_affected,outcome,details)
  values(v_run_id,'parent_family_links','disable_for_review',v_parent_review_checked,v_parent_review_disabled,
    case when v_parent_review_checked=0 then 'skipped'
         when p_mode='dry_run' then 'would_process'
         when v_enforce_parent then 'processed' else 'enforcement_disabled' end,
    jsonb_build_object(
      'inactivity_months',v_parent_months,
      'review_period_months',v_parent_review_months,
      'basis','last_activity_at; failed PIN attempts and sign-in alone do not reset activity',
      'actions','Account disabled; outstanding invitations revoked; parent-issued edit tokens invalidated',
      'history_note','Family membership and historical submissions remain in place during review'
    ));

  -- Stage 2: delete only after the review period, and only if meaningful activity
  -- has not resumed through another active member of the same family.
  select count(*) into v_checked
  from public.match_parent_access pa
  where pa.disabled_at is not null
    and pa.retention_review_after is not null
    and pa.retention_review_after <= now()
    and pa.last_activity_at < now() - make_interval(months => v_parent_months)
    and not exists (
      select 1 from public.retention_holds h
      where h.status='active' and h.target_table='match_parent_access'
        and h.target_reference=pa.id::text
    )
    and not exists (
      select 1 from public.retention_holds h
      where h.status='active' and (
        (h.target_table='match_parent_family_invitations' and exists (
          select 1 from public.match_parent_family_invitations i
          where i.id::text=h.target_reference
            and (i.invited_by_parent_id=pa.id or i.accepted_by_parent_id=pa.id or i.family_id=pa.family_id)
        ))
        or (h.target_table='match_parent_family_invites' and exists (
          select 1 from public.match_parent_family_invites i
          where i.id::text=h.target_reference
            and (i.invited_by_parent_id=pa.id or i.accepted_by_parent_id=pa.id or i.family_id=pa.family_id)
        ))
        or (h.target_table='match_parent_families' and pa.family_id is not null and h.target_reference=pa.family_id::text)
        or (h.target_table='match_parent_family_members' and exists (
          select 1 from public.match_parent_family_members fm
          where fm.id::text=h.target_reference and (fm.parent_access_id=pa.id or fm.family_id=pa.family_id)
        ))
      )
    );

  v_affected := 0;
  v_deleted_parents := 0;
  if v_checked>0 and p_mode<>'dry_run' and v_enforce_parent then
    for v_parent in
      select pa.id, pa.family_id
      from public.match_parent_access pa
      where pa.disabled_at is not null
        and pa.retention_review_after is not null
        and pa.retention_review_after <= now()
        and pa.last_activity_at < now() - make_interval(months => v_parent_months)
        and not exists (select 1 from public.retention_holds h where h.status='active' and h.target_table='match_parent_access' and h.target_reference=pa.id::text)
        and not exists (
          select 1 from public.retention_holds h
          where h.status='active' and (
            (h.target_table='match_parent_family_invitations' and exists (
              select 1 from public.match_parent_family_invitations i
              where i.id::text=h.target_reference
                and (i.invited_by_parent_id=pa.id or i.accepted_by_parent_id=pa.id or i.family_id=pa.family_id)
            ))
            or (h.target_table='match_parent_family_invites' and exists (
              select 1 from public.match_parent_family_invites i
              where i.id::text=h.target_reference
                and (i.invited_by_parent_id=pa.id or i.accepted_by_parent_id=pa.id or i.family_id=pa.family_id)
            ))
            or (h.target_table='match_parent_families' and pa.family_id is not null and h.target_reference=pa.family_id::text)
            or (h.target_table='match_parent_family_members' and exists (
              select 1 from public.match_parent_family_members fm
              where fm.id::text=h.target_reference and (fm.parent_access_id=pa.id or fm.family_id=pa.family_id)
            ))
          )
        )
      order by pa.id
      for update
    loop
      -- Remove invite rows referencing the account before deleting it.
      delete from public.match_parent_family_invitations i where (i.invited_by_parent_id=v_parent.id or i.accepted_by_parent_id=v_parent.id) and not exists (select 1 from public.retention_holds h where h.status='active' and h.target_table='match_parent_family_invitations' and h.target_reference=i.id::text);
      delete from public.match_parent_family_invites i where (i.invited_by_parent_id=v_parent.id or i.accepted_by_parent_id=v_parent.id) and not exists (select 1 from public.retention_holds h where h.status='active' and h.target_table='match_parent_family_invites' and h.target_reference=i.id::text);

      -- Preserve submission history but remove its live account/family references.
      update public.match_submissions
      set parent_name='Former parent',
          parent_contact=null,
          edit_token_hash=null,
          edit_lock_token_hash=null,
          edit_lock_expires_at=null,
          last_updated_by_parent_id=null
      where last_updated_by_parent_id=v_parent.id;

      update public.match_parent_family_members
      set linked_by_parent_id=null
      where linked_by_parent_id=v_parent.id;

      if v_parent.family_id is not null then
        v_family_id := v_parent.family_id;
        delete from public.match_parent_family_members
        where parent_access_id=v_parent.id;

        select count(*), min(parent_access_id)
        into v_remaining, v_owner_id
        from public.match_parent_family_members
        where family_id=v_family_id;

        if v_remaining > 0 then
          update public.match_parent_families
          set created_by_parent_id=v_owner_id
          where id=v_family_id and created_by_parent_id=v_parent.id;
        else
          update public.match_submissions set family_id=null where family_id=v_family_id;
          update public.match_parent_access set family_id=null where family_id=v_family_id;
          delete from public.match_parent_family_invitations i where i.family_id=v_family_id and not exists (select 1 from public.retention_holds h where h.status='active' and h.target_table='match_parent_family_invitations' and h.target_reference=i.id::text);
          delete from public.match_parent_family_invites i where i.family_id=v_family_id and not exists (select 1 from public.retention_holds h where h.status='active' and h.target_table='match_parent_family_invites' and h.target_reference=i.id::text);
          delete from public.match_parent_families where id=v_family_id;
        end if;
      end if;

      -- Handle any family created by this parent even if its membership row is missing.
      for v_family_id in
        select id from public.match_parent_families where created_by_parent_id=v_parent.id
      loop
        select count(*), min(parent_access_id)
        into v_remaining, v_owner_id
        from public.match_parent_family_members
        where family_id=v_family_id;
        if v_remaining > 0 then
          update public.match_parent_families set created_by_parent_id=v_owner_id where id=v_family_id;
        else
          update public.match_submissions set family_id=null where family_id=v_family_id;
          update public.match_parent_access set family_id=null where family_id=v_family_id;
          delete from public.match_parent_family_invitations i where i.family_id=v_family_id and not exists (select 1 from public.retention_holds h where h.status='active' and h.target_table='match_parent_family_invitations' and h.target_reference=i.id::text);
          delete from public.match_parent_family_invites i where i.family_id=v_family_id and not exists (select 1 from public.retention_holds h where h.status='active' and h.target_table='match_parent_family_invites' and h.target_reference=i.id::text);
          delete from public.match_parent_families where id=v_family_id;
        end if;
      end loop;

      update public.match_parent_access set family_id=null where id=v_parent.id;
      delete from public.match_parent_access where id=v_parent.id;
      v_deleted_parents := v_deleted_parents + 1;
    end loop;
    v_affected := v_deleted_parents;
  end if;

  end if;

  insert into public.retention_audit_log(run_id,policy_key,action,records_checked,records_affected,outcome,details)
  values(v_run_id,'parent_family_links','delete',v_checked,v_affected,
    case when v_checked=0 then 'skipped' when p_mode='dry_run' then 'would_process'
         when v_enforce_parent then 'processed' else 'enforcement_disabled' end,
    jsonb_build_object('retention_months',v_parent_months,
      'review_period_months',v_parent_review_months,
      'basis','last_activity_at; account must complete the additional review period',
      'history_note','historical submissions and player/attendance records are retained'));

  v_summary := v_summary || jsonb_build_object(
    'parent_accounts_for_review',v_parent_review_checked,
    'parent_accounts_disabled_for_review',v_parent_review_disabled,
    'inactive_parent_accounts_checked',v_checked,
    'parent_accounts_deleted',v_deleted_parents
  );

  -- Closed personal data request cases are anonymised after the approved period.
  -- A minimal, non-identifying record of the request and its handling is retained.
  select count(*) into v_pdm_checked
  from public.personal_data_requests r
  where r.retention_anonymised_at is null
    and r.status in ('completed','partially_completed','refused','withdrawn')
    and coalesce(r.completed_at,r.sent_at,case when r.status='withdrawn' then r.updated_at else null end)
      < now() - make_interval(months => v_pdm_months)
    and not exists (
      select 1 from public.retention_holds h
      where h.status='active' and h.target_table='personal_data_requests'
        and h.target_reference=r.id::text
    );

  v_pdm_anonymised := 0;
  if v_pdm_checked>0 and p_mode<>'dry_run' and v_enforce_pdm then
    update public.personal_data_requests r
    set subject_reference=null,
        subject_name=null,
        subject_locator='{}'::jsonb,
        requester_name=null,
        contact_details=null,
        scope_notes=null,
        extension_reason=null,
        decision_reason=null,
        response_notes=null,
        erasure_reviewed_by=null,
        erasure_review_notes=null,
        retention_anonymised_at=now(),
        updated_at=now()
    where r.retention_anonymised_at is null
      and r.status in ('completed','partially_completed','refused','withdrawn')
      and coalesce(r.completed_at,r.sent_at,case when r.status='withdrawn' then r.updated_at else null end)
        < now() - make_interval(months => v_pdm_months)
      and not exists (
        select 1 from public.retention_holds h
        where h.status='active' and h.target_table='personal_data_requests'
          and h.target_reference=r.id::text
      );
    get diagnostics v_pdm_anonymised = row_count;
  end if;

  insert into public.retention_audit_log(run_id,policy_key,action,records_checked,records_affected,outcome,details)
  values(v_run_id,'pdm_case_records','anonymise',v_pdm_checked,v_pdm_anonymised,
    case when v_pdm_checked=0 then 'skipped' when p_mode='dry_run' then 'would_process'
         when v_enforce_pdm then 'processed' else 'enforcement_disabled' end,
    jsonb_build_object(
      'retention_months',v_pdm_months,
      'closure_basis','completed_at, sent_at, or updated_at for withdrawn requests',
      'preserved','Request reference, request type, subject type, status, outcome, key dates and erasure handling counts',
      'removed','Subject and requester identifiers, contact details, free-text case notes and reviewer identity'
    ));
  v_summary := v_summary || jsonb_build_object(
    'pdm_case_records_checked',v_pdm_checked,
    'pdm_case_records_anonymised',v_pdm_anonymised
  );

  -- Archived players are anonymised after the configured number of completed seasons
  -- that began after the recorded archive date. Historical attendance linkage remains.
  select count(*) into v_checked
  from public.players p
  where p.archived=true and p.archived_at is not null
    and (select count(*) from public.seasons se
         where not se.is_current and se.start_date > p.archived_at::date) >= v_archive_seasons
    and p.name <> 'Archived player' and not exists (select 1 from public.retention_holds h where h.status='active' and h.target_table='players' and h.target_reference=p.player_id);
  v_affected := 0;
  v_anonymised_children := 0;
  if v_checked>0 and p_mode<>'dry_run' and v_enforce_archive then
    update public.match_availability ma
    set child_name='Archived player'
    from public.players p
    where ma.player_id=p.player_id
      and p.archived=true and p.archived_at is not null
      and (select count(*) from public.seasons se
           where not se.is_current and se.start_date > p.archived_at::date) >= v_archive_seasons
      and ma.child_name <> 'Archived player' and not exists (select 1 from public.retention_holds h where h.status='active' and ((h.target_table='players' and h.target_reference=p.player_id) or (h.target_table='match_availability' and h.target_reference=ma.id::text)));
    get diagnostics v_anonymised_children = row_count;

    update public.players p
    set name='Archived player',
        gms=false,
        coach_gms_suggestion=false,
        last_attendance_date=null
    where p.archived=true and p.archived_at is not null
      and (select count(*) from public.seasons se
           where not se.is_current and se.start_date > p.archived_at::date) >= v_archive_seasons
      and p.name <> 'Archived player' and not exists (select 1 from public.retention_holds h where h.status='active' and h.target_table='players' and h.target_reference=p.player_id);
    get diagnostics v_affected = row_count;
  end if;
  insert into public.retention_audit_log(run_id,policy_key,action,records_checked,records_affected,outcome,details)
  values(v_run_id,'archived_players','anonymise',v_checked,v_affected,
    case when v_checked=0 then 'skipped' when p_mode='dry_run' then 'would_process'
         when v_enforce_archive then 'processed' else 'enforcement_disabled' end,
    jsonb_build_object('completed_seasons',v_archive_seasons,
      'child_availability_names_anonymised',v_anonymised_children,
      'note','Player IDs remain to preserve attendance-history relationships'));
  v_summary := v_summary || jsonb_build_object('archived_players_eligible',v_checked,
    'archived_players_anonymised',v_affected,'availability_child_names_anonymised',v_anonymised_children);

  update public.retention_runs
  set completed_at=now(),status=v_status,summary=v_summary
  where id=v_run_id;
  return jsonb_build_object('run_id',v_run_id,'mode',v_mode,'status',v_status,'summary',v_summary);
exception when others then
  if v_run_id is not null then
    update public.retention_runs set completed_at=now(),status='failed',error_message=sqlerrm where id=v_run_id;
  end if;
  raise;
end;
$function$

