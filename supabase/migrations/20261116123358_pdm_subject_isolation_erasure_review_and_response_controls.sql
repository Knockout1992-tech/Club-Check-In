-- PDM subject isolation, server-side erasure review, final response validation and stronger System Admin PINs.

ALTER TABLE public.personal_data_requests ADD COLUMN IF NOT EXISTS decision_reason text;

ALTER TABLE public.personal_data_requests ADD COLUMN IF NOT EXISTS erasure_reviewed_at timestamptz;

ALTER TABLE public.personal_data_requests ADD COLUMN IF NOT EXISTS erasure_reviewed_by text;

ALTER TABLE public.personal_data_requests ADD COLUMN IF NOT EXISTS erasure_review_notes text;

ALTER TABLE public.personal_data_requests ADD COLUMN IF NOT EXISTS erasure_review_confirmed boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.change_system_admin_pin(current_system_admin_pin text, new_system_admin_pin text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
    IF NOT public._verify_system_admin_pin(current_system_admin_pin) THEN
        RETURN false;
    END IF;
    IF new_system_admin_pin IS NULL
       OR new_system_admin_pin !~ '^[0-9]{8,12}$'
       OR length(replace(new_system_admin_pin,left(new_system_admin_pin,1),''))=0
       OR new_system_admin_pin IN ('01234567','12345678','87654321','98765432','00000000','11111111','1234567890','0987654321') THEN
        RAISE EXCEPTION 'Choose an 8 to 12 digit PIN. Avoid obvious sequences or repeated digits.';
    END IF;
    UPDATE public.system_admin_credentials
    SET pin_hash=extensions.crypt(new_system_admin_pin,extensions.gen_salt('bf',12)),
        must_change_pin=false,failed_attempts=0,locked_until=NULL,updated_at=now()
    WHERE singleton=true;
    INSERT INTO public.system_admin_audit_log(source_system,severity,event_type,outcome,actor_type)
    VALUES('club_check_in','info','system_admin_pin_changed','success','system_admin');
    RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_personal_data_request(p_system_admin_pin text, p_request_type text, p_subject_type text, p_subject_reference text, p_subject_name text, p_subject_locator jsonb, p_requester_name text, p_requester_relationship text, p_contact_method text, p_contact_details text, p_received_at timestamp with time zone, p_identity_status text, p_authority_status text, p_scope_notes text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id bigint; v_ref text; v_due timestamptz; v_status text; v_clock timestamptz;
begin
 if not public._verify_system_admin_pin(p_system_admin_pin) then return null; end if;
 if p_request_type not in ('access','erasure','rectification','restriction','objection','portability','other')
  or p_subject_type not in ('parent','child','portal_child') or nullif(btrim(p_subject_name),'') is null
  or nullif(btrim(p_requester_name),'') is null
  or p_requester_relationship not in ('self','parent_or_guardian','authorised_representative','other')
  or p_contact_method not in ('email','letter','phone','club_contact_route')
  or p_identity_status not in ('unverified','verified','more_information_required','not_applicable')
  or p_authority_status not in ('not_applicable','unverified','verified','not_authorised') or p_received_at is null then
  return jsonb_build_object('success',false,'message','Complete the required request details.');
 end if;
 if p_received_at>now() then return jsonb_build_object('success',false,'message','The received date cannot be in the future.'); end if;
 if p_subject_type in ('child','portal_child') and (p_requester_relationship='self' or p_authority_status='not_applicable') then
  return jsonb_build_object('success',false,'message','A child request requires the requester relationship and parental/representative authority to be recorded.');
 end if;
 if p_subject_type='parent' and p_requester_relationship<>'self' and p_authority_status='not_applicable' then
  return jsonb_build_object('success',false,'message','A representative requesting an adult parent’s data must have their authority checked.');
 end if;
 if p_subject_type='parent' and (p_subject_reference is null or not exists(select 1 from public.match_parent_access where id=p_subject_reference::bigint)) then
  return jsonb_build_object('success',false,'message','Parent account not found.'); end if;
 if p_subject_type='child' and (p_subject_reference is null or not exists(select 1 from public.players where player_id=regexp_replace(p_subject_reference,'^player:',''))) then
  return jsonb_build_object('success',false,'message','Player record not found.'); end if;
 if p_subject_type='portal_child' and (p_subject_locator is null or p_subject_locator->>'age_group_id' is null
   or jsonb_typeof(p_subject_locator->'availability_ids') is distinct from 'array'
   or jsonb_array_length(coalesce(p_subject_locator->'availability_ids','[]'::jsonb))=0
   or (p_subject_locator->>'parent_access_id' is null and p_subject_locator->>'source_submission_id' is null)) then
  return jsonb_build_object('success',false,'message','Parent Portal child selection is incomplete. Refresh the search and select the exact child records.'); end if;
 if p_subject_type='portal_child' and exists(
  select 1 from jsonb_array_elements_text(p_subject_locator->'availability_ids') ids(value)
  left join public.match_availability ma on ma.id=ids.value::bigint
  left join public.match_submissions ms on ms.id=ma.submission_id
  where ma.id is null or ma.player_id is not null or ma.child_name<>p_subject_name
   or ma.age_group_id<>(p_subject_locator->>'age_group_id')::bigint
   or coalesce(ma.school_year,'')<>coalesce(p_subject_locator->>'school_year','')
   or ms.family_id is distinct from nullif(p_subject_locator->>'family_id','')::bigint
   or not ((p_subject_locator->>'parent_access_id' is not null and ms.last_updated_by_parent_id=(p_subject_locator->>'parent_access_id')::bigint)
    or (p_subject_locator->>'parent_access_id' is null and ms.id=(p_subject_locator->>'source_submission_id')::bigint))
 ) then return jsonb_build_object('success',false,'message','The selected Parent Portal child records no longer match the search. Refresh and select the child again.'); end if;
 v_clock:=case when p_identity_status='verified' and p_authority_status in ('verified','not_applicable') then p_received_at else null end;
 v_due:=coalesce(v_clock,p_received_at)+interval '1 month';
 v_status:=case when p_identity_status<>'verified' then 'awaiting_identity'
  when p_authority_status='not_authorised' then 'awaiting_authority'
  when p_authority_status not in ('verified','not_applicable') then 'awaiting_authority' else 'in_review' end;
 insert into public.personal_data_requests(request_type,subject_type,subject_reference,subject_name,subject_locator,
  requester_name,requester_relationship,contact_method,contact_details,received_at,due_at,clock_started_at,
  identity_status,authority_status,status,scope_notes)
 values(p_request_type,p_subject_type,p_subject_reference,btrim(p_subject_name),coalesce(p_subject_locator,'{}'::jsonb),
  btrim(p_requester_name),p_requester_relationship,p_contact_method,nullif(btrim(p_contact_details),''),
  p_received_at,v_due,v_clock,p_identity_status,p_authority_status,v_status,nullif(btrim(p_scope_notes),''))
 returning id,request_ref into v_id,v_ref;
 insert into public.system_admin_audit_log(source_system,severity,event_type,outcome,actor_type,request_id,details)
 values('club_check_in','info','personal_data_request_created','success','system_admin',v_ref,
  jsonb_build_object('request_type',p_request_type,'subject_type',p_subject_type,'due_at',v_due,'clock_started_at',v_clock));
 return jsonb_build_object('success',true,'id',v_id,'request_ref',v_ref,'due_at',v_due,'clock_started_at',v_clock);
exception when invalid_text_representation then
 return jsonb_build_object('success',false,'message','The selected subject reference is invalid.');
end;
$function$;

CREATE OR REPLACE FUNCTION public.execute_personal_data_erasure(p_system_admin_pin text, p_request_id bigint, p_confirm_reference text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.personal_data_requests%rowtype;v_player_id text;v_parent_id bigint;v_family_id bigint;
 v_member_count int;v_deleted int:=0;v_removed int:=0;v_preview jsonb;v_parent_name text;v_expected_count int:=0;
begin
 if not public._verify_system_admin_pin(p_system_admin_pin) then return null; end if;
 select * into r from public.personal_data_requests where id=p_request_id for update;
 if not found or r.request_type<>'erasure' then return jsonb_build_object('success',false,'message','Erasure request not found.'); end if;
 if r.erasure_executed_at is not null then
  return jsonb_build_object('success',false,'message','Erasure has already been carried out for this request. Prepare and send the response instead.');
 end if;
 if r.request_ref<>p_confirm_reference then return jsonb_build_object('success',false,'message','Confirmation reference does not match.'); end if;
 if r.erasure_reviewed_at is null or r.erasure_reviewed_at<now()-interval '24 hours' or r.erasure_review_confirmed is not true or length(btrim(coalesce(r.erasure_review_notes,'')))<10 then
  return jsonb_build_object('success',false,'message','A current, recorded legal and safeguarding erasure review is required before deletion.'); end if;
 if r.identity_status<>'verified' or r.authority_status not in ('verified','not_applicable') then return jsonb_build_object('success',false,'message','Identity and authority must be verified.'); end if;
 if r.status not in ('in_review','ready_to_send') then return jsonb_build_object('success',false,'message','Request is not in an approved review state.'); end if;
 v_preview:=public.preview_personal_data_erasure(p_system_admin_pin,p_request_id);
 if coalesce((v_preview->>'can_erase')::boolean,false) is not true then return jsonb_build_object('success',false,'message','Deletion is blocked by one or more retention holds. Review the deletion preview.','preview',v_preview); end if;
 if r.subject_type='parent' then
  v_parent_id:=r.subject_reference::bigint;
  select family_id,parent_name into v_family_id,v_parent_name from public.match_parent_access where id=v_parent_id for update;
  if not found then return jsonb_build_object('success',false,'message','Parent account no longer exists.'); end if;
  delete from public.match_parent_family_invitations where invited_by_parent_id=v_parent_id or accepted_by_parent_id=v_parent_id;
  get diagnostics v_removed=row_count;
  delete from public.match_parent_family_invites where invited_by_parent_id=v_parent_id or accepted_by_parent_id=v_parent_id;
  get diagnostics v_deleted=row_count;v_removed:=v_removed+v_deleted;
  update public.match_submissions set parent_name='Former parent',parent_contact=null,edit_token_hash=null,
   edit_lock_token_hash=null,edit_lock_expires_at=null,last_updated_by_parent_id=null
  where last_updated_by_parent_id=v_parent_id
   or (last_updated_by_parent_id is null and parent_name=v_parent_name
    and not exists(select 1 from public.match_parent_access other where other.id<>v_parent_id
     and other.normalised_name=(select normalised_name from public.match_parent_access where id=v_parent_id)));
  update public.match_parent_family_members set linked_by_parent_id=null where linked_by_parent_id=v_parent_id;
  if v_family_id is not null then
   delete from public.match_parent_family_members where family_id=v_family_id and parent_access_id=v_parent_id;
   select count(*) into v_member_count from public.match_parent_family_members where family_id=v_family_id;
   if v_member_count>0 then
    update public.match_parent_families set created_by_parent_id=(select min(parent_access_id) from public.match_parent_family_members where family_id=v_family_id)
     where id=v_family_id and created_by_parent_id=v_parent_id;
   else
    update public.match_submissions set family_id=null where family_id=v_family_id;
    update public.match_parent_access set family_id=null where family_id=v_family_id;
    delete from public.match_parent_family_invitations where family_id=v_family_id;
    delete from public.match_parent_family_invites where family_id=v_family_id;
    delete from public.match_parent_families where id=v_family_id;
   end if;
  end if;
  for v_family_id in select id from public.match_parent_families where created_by_parent_id=v_parent_id loop
   delete from public.match_parent_family_invitations where family_id=v_family_id;
   delete from public.match_parent_family_invites where family_id=v_family_id;
   select count(*) into v_member_count from public.match_parent_family_members where family_id=v_family_id;
   if v_member_count>0 then
    update public.match_parent_families set created_by_parent_id=(select min(parent_access_id) from public.match_parent_family_members where family_id=v_family_id)
     where id=v_family_id;
   else
    update public.match_submissions set family_id=null where family_id=v_family_id;
    update public.match_parent_access set family_id=null where family_id=v_family_id;
    delete from public.match_parent_families where id=v_family_id;
   end if;
  end loop;
  update public.match_parent_access set family_id=null where id=v_parent_id;
  delete from public.match_parent_access where id=v_parent_id;
  get diagnostics v_deleted=row_count;
  if v_deleted<>1 then raise exception 'Parent account could not be removed completely.'; end if;
  v_removed:=v_removed+v_deleted;
 elsif r.subject_type='child' then
  v_player_id:=regexp_replace(r.subject_reference,'^player:','');
  delete from public.attendance_records where player_id=v_player_id;get diagnostics v_removed=row_count;
  delete from public.match_availability where player_id=v_player_id;get diagnostics v_deleted=row_count;v_removed:=v_removed+v_deleted;
  delete from public.players where player_id=v_player_id;get diagnostics v_deleted=row_count;
  if v_deleted<>1 then raise exception 'Player record could not be removed completely.'; end if;
  v_removed:=v_removed+v_deleted;
 elsif r.subject_type='portal_child' then
  delete from public.match_availability ma using public.match_submissions ms
  where ma.submission_id=ms.id and ma.id in (select ids.value::bigint from jsonb_array_elements_text(r.subject_locator->'availability_ids') ids(value))
   and ma.player_id is null and ma.child_name=r.subject_name
   and ma.age_group_id=(r.subject_locator->>'age_group_id')::bigint
   and coalesce(ma.school_year,'')=coalesce(r.subject_locator->>'school_year','')
   and ms.family_id is not distinct from nullif(r.subject_locator->>'family_id','')::bigint
   and ((r.subject_locator->>'parent_access_id' is not null and ms.last_updated_by_parent_id=(r.subject_locator->>'parent_access_id')::bigint)
    or (r.subject_locator->>'parent_access_id' is null and ms.id=(r.subject_locator->>'source_submission_id')::bigint));
  get diagnostics v_removed=row_count;
  v_expected_count:=coalesce((v_preview->'records'->>'availability_records')::int,0);
  if v_expected_count=0 or v_removed<>v_expected_count then raise exception 'The exact Parent Portal child record set changed after review. No deletion was completed.'; end if;
 end if;
 update public.personal_data_requests set status='ready_to_send',decision='Erasure completed for identified live records',erasure_executed_at=now(),erasure_records_removed=v_removed,
  response_notes='Identified live application records were erased. This operation does not immediately remove encrypted provider backups or independently retained provider security/operational logs; those are subject to the documented supplier backup and retention lifecycle. Anonymous aggregate statistics and records retained under an applicable legal or safeguarding exception are outside this operation.',
  completed_at=null,updated_at=now() where id=p_request_id;
 insert into public.system_admin_audit_log(source_system,severity,event_type,outcome,actor_type,request_id,details)
 values('club_check_in','warning','personal_data_erasure_executed','success','system_admin',r.request_ref,
  jsonb_build_object('subject_type',r.subject_type,'records_removed',v_removed,
   'retention_note','No names, account identifiers or child details recorded in this audit event.'));
 return jsonb_build_object('success',true,'request_ref',r.request_ref,'records_removed',v_removed,
  'message','Erasure completed for the identified live application records. Check supplier backups and logs against the club retention arrangements before confirming full erasure.');
end;$function$;

CREATE OR REPLACE FUNCTION public.get_personal_data_subject_bundle(p_system_admin_pin text, p_subject_type text, p_subject_reference text, p_subject_name text DEFAULT NULL::text, p_subject_locator jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_parent_id bigint;
  v_player_id text;
  v_account jsonb;
  v_submissions jsonb;
  v_audit jsonb;
  v_player jsonb;
  v_attendance jsonb;
  v_availability jsonb;
  v_family jsonb;
  v_locator jsonb := coalesce(p_subject_locator,'{}'::jsonb);
  v_name text := coalesce(p_subject_name,'');
  v_ag_id bigint;
  v_family_id bigint;
  v_parent_name text;
  v_school_year text;
  v_policy jsonb;
  v_retention jsonb;
begin
  if not public._verify_system_admin_pin(p_system_admin_pin) then return null; end if;

  if p_subject_type='parent' then
    v_parent_id := nullif(p_subject_reference,'')::bigint;
    select to_jsonb(x) into v_account from (
      select id,parent_name,created_at,updated_at,last_activity_at,disabled_at,
        retention_review_after
      from public.match_parent_access where id=v_parent_id
    ) x;
    if v_account is null then return jsonb_build_object('success',false,'message','Parent account not found.'); end if;

    select coalesce(jsonb_agg(to_jsonb(x) order by x.submitted_at desc),'[]'::jsonb)
    into v_submissions
    from (
      select ms.id,ms.parent_name,ms.parent_contact,ms.submitted_at,ms.updated_at,
        mf.opposition,mf.fixture_date,mf.fixture_type,mf.status as fixture_status
      from public.match_submissions ms
      left join public.match_fixtures mf on mf.id=ms.fixture_id
      where ms.last_updated_by_parent_id=v_parent_id
      order by ms.updated_at desc
    ) x;

    select coalesce(jsonb_agg(to_jsonb(x) order by x.occurred_at desc),'[]'::jsonb)
    into v_audit
    from (
      select occurred_at,event_type,outcome,severity,details
      from public.system_admin_audit_log
      where source_system='match_availability_parent_portal'
        and actor_reference=v_parent_id::text
      order by occurred_at desc
    ) x;

    select jsonb_build_object(
      'family_id',pa.family_id,
      'linked_account_count',(select count(*) from public.match_parent_family_members fm where fm.family_id=pa.family_id),
      'joined_at',(select min(fm.joined_at) from public.match_parent_family_members fm where fm.parent_access_id=pa.id)
    ) into v_family from public.match_parent_access pa where pa.id=v_parent_id;

    insert into public.system_admin_audit_log(source_system,severity,event_type,outcome,actor_type,actor_reference,details)
    values('club_check_in','info','personal_data_bundle_accessed','success','system_admin',v_parent_id::text,
      jsonb_build_object('subject_type','parent','linked_submissions',jsonb_array_length(v_submissions)));

    return jsonb_build_object('success',true,'subject_type','parent','account',v_account,
      'family',coalesce(v_family,'{}'::jsonb),
      'family_members','[]'::jsonb,
      'family_invitations',coalesce((select jsonb_agg(jsonb_build_object('created_at',i.created_at,'expires_at',i.expires_at,
        'accepted_at',i.accepted_at,'revoked_at',i.revoked_at,'invited_by_subject',i.invited_by_parent_id=v_parent_id,
        'accepted_by_subject',i.accepted_by_parent_id=v_parent_id))
        from public.match_parent_family_invitations i where i.invited_by_parent_id=v_parent_id or i.accepted_by_parent_id=v_parent_id),'[]'::jsonb),
      'family_invites',coalesce((select jsonb_agg(jsonb_build_object('created_at',i.created_at,'expires_at',i.expires_at,
        'accepted_at',i.accepted_at,'revoked_at',i.revoked_at,'invited_by_subject',i.invited_by_parent_id=v_parent_id,
        'accepted_by_subject',i.accepted_by_parent_id=v_parent_id))
        from public.match_parent_family_invites i where i.invited_by_parent_id=v_parent_id or i.accepted_by_parent_id=v_parent_id),'[]'::jsonb),
      'shared_family_responses','[]'::jsonb,
      'submissions',v_submissions,'security_activity',v_audit,
      'review_notice','This parent account export excludes children and other family members. Their personal data requires a separate, appropriately verified request. Older submissions not linked to this account are not included.');
  elsif p_subject_type='child' then
    v_player_id := regexp_replace(coalesce(p_subject_reference,''),'^player:','');
    select to_jsonb(x) into v_player from (
      select player_id,name,age_group,active,archived,created_at,archived_at,last_attendance_date,gms
      from public.players where player_id=v_player_id
    ) x;
    if v_player is null then return jsonb_build_object('success',false,'message','Player record not found.'); end if;

    select coalesce(jsonb_agg(to_jsonb(x) order by x.register_date desc),'[]'::jsonb)
    into v_attendance
    from (
      select ar.id,reg.register_date,reg.age_group,ar.present,ar.created_at,ar.updated_at
      from public.attendance_records ar
      join public.attendance_registers reg on reg.id=ar.register_id
      where ar.player_id=v_player_id
      order by reg.register_date desc
    ) x;

    select coalesce(jsonb_agg(to_jsonb(x) order by x.fixture_date desc),'[]'::jsonb)
    into v_availability
    from (
      select ma.child_name,ma.school_year,ma.availability,ma.duplicate_review_status,ma.created_at,ma.updated_at,
        ag.display_name as age_group,mf.opposition,mf.fixture_date,mf.fixture_type,mf.status as fixture_status
      from public.match_availability ma
      join public.match_submissions ms on ms.id=ma.submission_id
      join public.match_fixtures mf on mf.id=ms.fixture_id
      join public.age_groups ag on ag.id=ma.age_group_id
      where ma.player_id=v_player_id
      order by mf.fixture_date desc
    ) x;

    insert into public.system_admin_audit_log(source_system,severity,event_type,outcome,actor_type,actor_reference,details)
    values('club_check_in','info','personal_data_bundle_accessed','success','system_admin',v_player_id,
      jsonb_build_object('subject_type','child','attendance_records',jsonb_array_length(v_attendance),'availability_records',jsonb_array_length(v_availability)));

    return jsonb_build_object('success',true,'subject_type','child','player',v_player,
      'attendance',v_attendance,'availability',v_availability);
  elsif p_subject_type='portal_child' then
    v_ag_id := nullif(v_locator->>'age_group_id','')::bigint;
    v_family_id := nullif(v_locator->>'family_id','')::bigint;
    v_parent_name := coalesce(v_locator->>'parent_name','');
    v_school_year := coalesce(v_locator->>'school_year','');
    if coalesce((v_locator->>'ambiguous_match')::boolean,false) then
      return jsonb_build_object('success',false,'message','The child match is ambiguous. Confirm the exact child record before preparing a data copy.');
    end if;
    if jsonb_typeof(v_locator->'availability_ids') is distinct from 'array' or jsonb_array_length(coalesce(v_locator->'availability_ids','[]'::jsonb))=0 then
      return jsonb_build_object('success',false,'message','The exact Parent Portal child records are missing. Search again.');
    end if;
    select coalesce(jsonb_agg(to_jsonb(x) order by x.fixture_date desc),'[]'::jsonb)
    into v_availability
    from (
      select ma.child_name,ma.school_year,ma.availability,ma.created_at,ma.updated_at,
        ag.display_name as age_group,mf.opposition,mf.fixture_date,mf.fixture_type,mf.status as fixture_status
      from public.match_availability ma
      join public.match_submissions ms on ms.id=ma.submission_id
      join public.match_fixtures mf on mf.id=ms.fixture_id
      join public.age_groups ag on ag.id=ma.age_group_id
      where ma.id in (select ids.value::bigint from jsonb_array_elements_text(v_locator->'availability_ids') ids(value))
        and ma.player_id is null and ma.child_name=v_name and ma.age_group_id=v_ag_id
        and coalesce(ma.school_year,'')=v_school_year
        and ms.family_id is not distinct from v_family_id
        and ((v_locator->>'parent_access_id' is not null and ms.last_updated_by_parent_id=(v_locator->>'parent_access_id')::bigint)
          or (v_locator->>'parent_access_id' is null and ms.id=(v_locator->>'source_submission_id')::bigint))
      order by mf.fixture_date desc
    ) x;
    if jsonb_array_length(v_availability)=0 then return jsonb_build_object('success',false,'message','The selected Parent Portal child records were not found. Search again.'); end if;
    insert into public.system_admin_audit_log(source_system,severity,event_type,outcome,actor_type,actor_reference,details)
    values('club_check_in','info','personal_data_bundle_accessed','success','system_admin',null,
      jsonb_build_object('subject_type','portal_child','availability_records',jsonb_array_length(v_availability)));
    return jsonb_build_object('success',true,'subject_type','portal_child','child',jsonb_build_object('name',v_name,'age_group_id',v_ag_id,'school_year',v_school_year),'availability',v_availability);
  end if;

  return jsonb_build_object('success',false,'message','Unsupported subject type.');
exception when invalid_text_representation then
  return jsonb_build_object('success',false,'message','The selected record reference is invalid.');
end;
$function$;

CREATE OR REPLACE FUNCTION public.preview_personal_data_erasure(p_system_admin_pin text, p_request_id bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.personal_data_requests%rowtype; v_player_id text; v_parent_id bigint;
 v_counts jsonb; v_blockers jsonb := '[]'::jsonb; v_count int; v_legacy_count int; v_duplicate_name_count int;
begin
 if not public._verify_system_admin_pin(p_system_admin_pin) then return null; end if;
 select * into r from public.personal_data_requests where id=p_request_id;
 if not found or r.request_type<>'erasure' then return jsonb_build_object('success',false,'message','Erasure request not found.'); end if;
 if r.identity_status<>'verified' or r.authority_status not in ('verified','not_applicable') then
  return jsonb_build_object('success',false,'message','Identity and, where relevant, parental authority must be verified first.');
 end if;
 if r.subject_type='parent' then
  v_parent_id:=r.subject_reference::bigint;
  select jsonb_build_object(
   'parent_account',(select count(*) from public.match_parent_access where id=v_parent_id),
   'family_memberships',(select count(*) from public.match_parent_family_members where parent_access_id=v_parent_id),
   'invitations',(select count(*) from public.match_parent_family_invitations where invited_by_parent_id=v_parent_id or accepted_by_parent_id=v_parent_id),
   'submissions_authored',(select count(*) from public.match_submissions where last_updated_by_parent_id=v_parent_id),
   'legacy_unlinked_submissions',(select count(*) from public.match_submissions where last_updated_by_parent_id is null and parent_name=(select parent_name from public.match_parent_access where id=v_parent_id))
  ) into v_counts;
  if coalesce((v_counts->>'parent_account')::int,0)=0 then
   v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('type','missing_subject','count',1,'message','The parent account no longer exists.'));
  end if;
  select count(*) into v_legacy_count from public.match_submissions where last_updated_by_parent_id is null and parent_name=(select parent_name from public.match_parent_access where id=v_parent_id);
  select count(*) into v_duplicate_name_count from public.match_parent_access pa where pa.id<>v_parent_id and pa.normalised_name=(select normalised_name from public.match_parent_access where id=v_parent_id);
  if v_legacy_count>0 and v_duplicate_name_count>0 then
   v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('type','ambiguous_legacy_parent_records','count',v_legacy_count,'message','Older submissions with the same parent name cannot be safely attributed because another parent account has the same normalised name. Resolve these records before erasure.'));
  end if;
  select count(*) into v_count from public.retention_holds h where h.status='active' and
   ((h.target_table='match_parent_access' and h.target_reference=v_parent_id::text)
    or (h.target_table='match_parent_family_members' and h.target_reference in (select id::text from public.match_parent_family_members where parent_access_id=v_parent_id or linked_by_parent_id=v_parent_id))
    or (h.target_table='match_parent_families' and h.target_reference in (select id::text from public.match_parent_families where created_by_parent_id=v_parent_id))
    or (h.target_table='match_submissions' and h.target_reference in (select id::text from public.match_submissions where last_updated_by_parent_id=v_parent_id or (last_updated_by_parent_id is null and parent_name=(select parent_name from public.match_parent_access where id=v_parent_id))))
    or (h.target_table='match_parent_family_invitations' and h.target_reference in
       (select id::text from public.match_parent_family_invitations where invited_by_parent_id=v_parent_id or accepted_by_parent_id=v_parent_id))
    or (h.target_table='match_parent_family_invites' and h.target_reference in
       (select id::text from public.match_parent_family_invites where invited_by_parent_id=v_parent_id or accepted_by_parent_id=v_parent_id)));
  if v_count>0 then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('type','retention_hold','count',v_count,'message','One or more parent account or invitation records are on hold.')); end if;
 elsif r.subject_type='child' then
  v_player_id:=regexp_replace(r.subject_reference,'^player:','');
  select jsonb_build_object(
   'player_record',(select count(*) from public.players where player_id=v_player_id),
   'attendance_records',(select count(*) from public.attendance_records where player_id=v_player_id),
   'availability_records',(select count(*) from public.match_availability where player_id=v_player_id)
  ) into v_counts;
  if coalesce((v_counts->>'player_record')::int,0)=0 then
   v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('type','missing_subject','count',1,'message','The player record no longer exists.'));
  end if;
  select count(*) into v_count from public.retention_holds h where h.status='active' and
   ((h.target_table='players' and h.target_reference=v_player_id)
    or (h.target_table='attendance_records' and h.target_reference in (select id::text from public.attendance_records where player_id=v_player_id))
    or (h.target_table='match_availability' and h.target_reference in (select id::text from public.match_availability where player_id=v_player_id)));
  if v_count>0 then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('type','retention_hold','count',v_count,'message','One or more child records are protected by a retention hold.')); end if;
 elsif r.subject_type='portal_child' then
  select jsonb_build_object('availability_records',count(*)) into v_counts
  from public.match_availability ma join public.match_submissions ms on ms.id=ma.submission_id
  where ma.id in (select ids.value::bigint from jsonb_array_elements_text(r.subject_locator->'availability_ids') ids(value))
   and ma.player_id is null and ma.child_name=r.subject_name
   and ma.age_group_id=(r.subject_locator->>'age_group_id')::bigint
   and coalesce(ma.school_year,'')=coalesce(r.subject_locator->>'school_year','')
   and ms.family_id is not distinct from nullif(r.subject_locator->>'family_id','')::bigint
   and ((r.subject_locator->>'parent_access_id' is not null and ms.last_updated_by_parent_id=(r.subject_locator->>'parent_access_id')::bigint)
    or (r.subject_locator->>'parent_access_id' is null and ms.id=(r.subject_locator->>'source_submission_id')::bigint));
  select count(*) into v_count from public.retention_holds h where h.status='active' and h.target_table='match_availability'
   and h.target_reference in (select ma.id::text from public.match_availability ma join public.match_submissions ms on ms.id=ma.submission_id
    where ma.id in (select ids.value::bigint from jsonb_array_elements_text(r.subject_locator->'availability_ids') ids(value))
   and ma.player_id is null and ma.child_name=r.subject_name
   and ma.age_group_id=(r.subject_locator->>'age_group_id')::bigint
   and coalesce(ma.school_year,'')=coalesce(r.subject_locator->>'school_year','')
   and ms.family_id is not distinct from nullif(r.subject_locator->>'family_id','')::bigint
   and ((r.subject_locator->>'parent_access_id' is not null and ms.last_updated_by_parent_id=(r.subject_locator->>'parent_access_id')::bigint)
    or (r.subject_locator->>'parent_access_id' is null and ms.id=(r.subject_locator->>'source_submission_id')::bigint)));
  if coalesce((v_counts->>'availability_records')::int,0)=0 then
   v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('type','missing_subject','count',1,'message','The selected Parent Portal child records no longer exist.'));
  end if;
  if coalesce((r.subject_locator->>'ambiguous_match')::boolean,false) then
   v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('type','ambiguous_child_match','count',1,'message','More than one child with the same name, age group and school year appears in one fixture submission. Resolve which child is the subject before deletion.')); end if;
  if v_count>0 then v_blockers:=v_blockers||jsonb_build_array(jsonb_build_object('type','retention_hold','count',v_count,'message','One or more child availability records are protected by a retention hold.')); end if;
 else return jsonb_build_object('success',false,'message','Unsupported subject type.'); end if;

 return jsonb_build_object('success',true,'request_ref',r.request_ref,'subject_type',r.subject_type,
  'records',coalesce(v_counts,'{}'::jsonb),'blockers',v_blockers,'can_erase',jsonb_array_length(v_blockers)=0,
  'retained_aggregate_note','Anonymous attendance-history totals and security records are not linked to this individual in a way that permits safe attribution. They are not included in this erasure operation.');
exception when invalid_text_representation then
 return jsonb_build_object('success',false,'message','The subject reference or scope is invalid.');
end;$function$;

CREATE OR REPLACE FUNCTION public.record_personal_data_erasure_review(p_system_admin_pin text, p_request_id bigint, p_review_notes text, p_confirmed boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r public.personal_data_requests%rowtype; v_preview jsonb;
BEGIN
 IF NOT public._verify_system_admin_pin(p_system_admin_pin) THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public.personal_data_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND OR r.request_type<>'erasure' THEN RETURN jsonb_build_object('success',false,'message','Erasure request not found.'); END IF;
 IF r.erasure_executed_at IS NOT NULL THEN RETURN jsonb_build_object('success',false,'message','Erasure has already been executed.'); END IF;
 IF r.identity_status<>'verified' OR r.authority_status NOT IN ('verified','not_applicable') THEN
  RETURN jsonb_build_object('success',false,'message','Identity and authority must be verified before recording the review.');
 END IF;
 IF r.status NOT IN ('in_review','ready_to_send') OR p_confirmed IS NOT TRUE OR length(btrim(coalesce(p_review_notes,'')))<10 THEN
  RETURN jsonb_build_object('success',false,'message','Confirm the legal and safeguarding review and enter meaningful review notes.');
 END IF;
 v_preview:=public.preview_personal_data_erasure(p_system_admin_pin,p_request_id);
 IF coalesce((v_preview->>'can_erase')::boolean,false) IS NOT TRUE THEN
  RETURN jsonb_build_object('success',false,'message','The latest deletion preview contains blockers. Review them before proceeding.','preview',v_preview);
 END IF;
 UPDATE public.personal_data_requests SET erasure_reviewed_at=now(),erasure_reviewed_by='system_admin',
  erasure_review_notes=btrim(p_review_notes),erasure_review_confirmed=true,updated_at=now()
 WHERE id=p_request_id;
 INSERT INTO public.system_admin_audit_log(source_system,severity,event_type,outcome,actor_type,request_id,details)
 VALUES('club_check_in','warning','personal_data_erasure_reviewed','success','system_admin',r.request_ref,
  jsonb_build_object('review_confirmed',true,'review_note_length',length(btrim(p_review_notes))));
 RETURN jsonb_build_object('success',true,'request_ref',r.request_ref,'reviewed_at',now());
END;$function$;

CREATE OR REPLACE FUNCTION public.record_personal_data_response(p_system_admin_pin text, p_request_id bigint, p_decision text, p_decision_reason text, p_response_text text, p_sent_via text, p_access_copy_confirmed boolean, p_third_party_reviewed boolean, p_accuracy_confirmed boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE r public.personal_data_requests%rowtype; v_status text;
BEGIN
 IF NOT public._verify_system_admin_pin(p_system_admin_pin) THEN RETURN NULL; END IF;
 SELECT * INTO r FROM public.personal_data_requests WHERE id=p_request_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'message','Request not found.'); END IF;
 IF r.sent_at IS NOT NULL OR r.status='withdrawn' THEN
  RETURN jsonb_build_object('success',false,'message','This request has already been finalised.');
 END IF;
 IF r.identity_status<>'verified' OR r.authority_status NOT IN ('verified','not_applicable') THEN
  RETURN jsonb_build_object('success',false,'message','Identity and authority must be verified before sending a final response.');
 END IF;
 IF p_decision IS NULL OR length(btrim(coalesce(p_decision_reason,'')))<10 OR length(btrim(coalesce(p_response_text,'')))<30
  OR position('[' in coalesce(p_response_text,''))>0 OR position(']' in coalesce(p_response_text,''))>0 THEN
  RETURN jsonb_build_object('success',false,'message','Record the decision reasons and remove all draft placeholders before sending.');
 END IF;
 IF p_sent_via IS NULL OR p_sent_via NOT IN ('club_contact_route','email','letter','phone')
  OR p_third_party_reviewed IS NOT TRUE OR p_accuracy_confirmed IS NOT TRUE THEN
  RETURN jsonb_build_object('success',false,'message','Complete the disclosure and accuracy checks before sending.');
 END IF;
 IF r.request_type IN ('access','portability') AND p_decision<>'refused' AND p_access_copy_confirmed IS NOT TRUE THEN
  RETURN jsonb_build_object('success',false,'message','Confirm that the required personal data copy has been securely supplied.');
 END IF;
 IF NOT (
  (r.request_type='access' AND p_decision IN ('provided','partially_provided','refused')) OR
  (r.request_type='erasure' AND p_decision IN ('erased','refused')) OR
  (r.request_type='rectification' AND p_decision IN ('corrected','partially_corrected','refused')) OR
  (r.request_type='restriction' AND p_decision IN ('restricted','partially_restricted','refused')) OR
  (r.request_type='objection' AND p_decision IN ('accepted','partially_accepted','refused')) OR
  (r.request_type='portability' AND p_decision IN ('provided','partially_provided','refused')) OR
  (r.request_type='other' AND p_decision IN ('completed','partially_completed','not_actioned'))
 ) THEN RETURN jsonb_build_object('success',false,'message','The selected outcome is not valid for this request type.'); END IF;
 IF r.request_type='erasure' AND (
  (r.erasure_executed_at IS NOT NULL AND p_decision<>'erased') OR
  (r.erasure_executed_at IS NULL AND p_decision<>'refused')
 ) THEN RETURN jsonb_build_object('success',false,'message','The erasure outcome must match the recorded deletion result.'); END IF;
 v_status:=CASE WHEN p_decision IN ('refused','not_actioned') THEN 'refused'
  WHEN p_decision LIKE 'partially_%' THEN 'partially_completed' ELSE 'completed' END;
 UPDATE public.personal_data_requests SET status=v_status,decision=p_decision,decision_reason=btrim(p_decision_reason),
  response_notes=btrim(p_response_text),sent_at=now(),sent_via=p_sent_via,completed_at=now(),updated_at=now()
 WHERE id=p_request_id;
 IF r.request_type='erasure' AND r.erasure_executed_at IS NOT NULL THEN
  UPDATE public.personal_data_requests SET subject_name=NULL,subject_reference=NULL,subject_locator='{}'::jsonb,
   requester_name=NULL,contact_details=NULL,scope_notes=NULL
  WHERE id=p_request_id;
 END IF;
 INSERT INTO public.system_admin_audit_log(source_system,severity,event_type,outcome,actor_type,request_id,details)
 VALUES('club_check_in','info','personal_data_response_sent','success','system_admin',r.request_ref,
  jsonb_build_object('decision',p_decision,'status',v_status,'sent_via',p_sent_via,
   'access_copy_confirmed',coalesce(p_access_copy_confirmed,false),'third_party_reviewed',true,'accuracy_confirmed',true));
 RETURN jsonb_build_object('success',true,'request_ref',r.request_ref,'status',v_status,'sent_at',now());
END;$function$;

CREATE OR REPLACE FUNCTION public.search_personal_data_subjects(p_system_admin_pin text, p_search_term text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_term text:=lower(btrim(coalesce(p_search_term,'')));v_parents jsonb;v_children jsonb;
begin
 if not public._verify_system_admin_pin(p_system_admin_pin) then return null; end if;
 if length(v_term)<2 or length(v_term)>100 then return jsonb_build_object('success',false,'message','Enter at least two characters.'); end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.parent_name),'[]'::jsonb) into v_parents
 from (select pa.id::text as subject_reference,pa.parent_name,pa.created_at,pa.last_activity_at,pa.disabled_at,
  (select count(*) from public.match_parent_family_members fm where fm.parent_access_id=pa.id) as family_memberships,
  (select count(*) from public.match_submissions ms where ms.last_updated_by_parent_id=pa.id) as linked_submissions
  from public.match_parent_access pa where lower(pa.parent_name) like '%'||v_term||'%' order by pa.parent_name limit 30) x;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.subject_name,x.age_group),'[]'::jsonb) into v_children
 from (
  select 'player:'||p.player_id as subject_reference,'child'::text as subject_type,p.name as subject_name,
   p.age_group,null::text as school_year,p.active,p.archived,
   (select count(*) from public.attendance_records ar where ar.player_id=p.player_id) as attendance_records,
   (select count(*) from public.match_availability ma where ma.player_id=p.player_id) as availability_records,
   null::bigint as age_group_id,null::bigint as family_id,null::text as parent_name,null::bigint as parent_access_id,null::bigint as source_submission_id,
   'Club Check-In player'::text as context_label,null::jsonb as availability_ids,false as ambiguous_match
  from public.players p where lower(p.name) like '%'||v_term||'%'
  union all
  select 'portal:'||encode(convert_to(ma.child_name||'|'||ma.age_group_id::text||'|'||coalesce(ma.school_year,'')||'|'||coalesce(ms.family_id::text,'')||'|'||coalesce(ms.parent_name,'')||'|'||coalesce(ms.last_updated_by_parent_id::text,'legacy:'||ms.id::text),'UTF8'),'base64'),
   'portal_child'::text,ma.child_name,ag.display_name,ma.school_year,null::boolean,null::boolean,0::bigint,count(*)::bigint,
   ma.age_group_id,ms.family_id,ms.parent_name,ms.last_updated_by_parent_id as parent_access_id,
   case when ms.last_updated_by_parent_id is null then ms.id else null end as source_submission_id,
   case when ms.family_id is not null then 'Parent Portal · shared family response' else 'Parent Portal · '||coalesce(ms.parent_name,'parent not recorded') end,
   jsonb_agg(ma.id order by ma.id),
   bool_or((select count(*) from public.match_availability dup
     where dup.submission_id=ma.submission_id and dup.player_id is null
       and lower(dup.child_name)=lower(ma.child_name) and dup.age_group_id=ma.age_group_id
       and coalesce(dup.school_year,'')=coalesce(ma.school_year,''))>1)
  from public.match_availability ma join public.match_submissions ms on ms.id=ma.submission_id
   join public.age_groups ag on ag.id=ma.age_group_id
  where ma.player_id is null and lower(ma.child_name) like '%'||v_term||'%'
  group by ma.child_name,ma.age_group_id,ag.display_name,ma.school_year,ms.family_id,ms.parent_name,ms.last_updated_by_parent_id,case when ms.last_updated_by_parent_id is null then ms.id else null end
  order by subject_name,age_group limit 50
 ) x;
 insert into public.system_admin_audit_log(source_system,severity,event_type,outcome,actor_type,details)
 values('club_check_in','info','personal_data_subject_search','success','system_admin',
  jsonb_build_object('search_length',length(v_term),'parent_results',jsonb_array_length(v_parents),'child_results',jsonb_array_length(v_children)));
 return jsonb_build_object('success',true,'parents',v_parents,'children',v_children);
end;$function$;

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
  sent_at=p_sent_at,sent_via=nullif(btrim(p_sent_via),''),completed_at=p_completed_at,
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
$function$;

REVOKE ALL ON FUNCTION public.record_personal_data_erasure_review(text,bigint,text,boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_personal_data_erasure_review(text,bigint,text,boolean) TO anon,authenticated;

REVOKE ALL ON FUNCTION public.record_personal_data_response(text,bigint,text,text,text,text,boolean,boolean,boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.record_personal_data_response(text,bigint,text,text,text,text,boolean,boolean,boolean) TO anon,authenticated;

UPDATE public.system_admin_credentials SET must_change_pin=true,updated_at=now() WHERE singleton=true AND must_change_pin=false;

NOTIFY pgrst,'reload schema';