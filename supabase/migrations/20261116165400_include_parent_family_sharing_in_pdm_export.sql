-- Include the requesting parent's own family-sharing relationship in their data export.
-- Do not disclose other family members' profile data, child records or submissions.
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
  v_family_joined_at timestamptz;
  v_family_linked_by_subject boolean;
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

    select fm.family_id,fm.joined_at,(fm.linked_by_parent_id=v_parent_id)
      into v_family_id,v_family_joined_at,v_family_linked_by_subject
    from public.match_parent_family_members fm
    where fm.parent_access_id=v_parent_id;

    select jsonb_build_object(
      'is_linked',v_family_id is not null,
      'linked_account_count',case when v_family_id is null then 0 else
        (select count(*) from public.match_parent_family_members fm where fm.family_id=v_family_id) end,
      'joined_at',v_family_joined_at,
      'link_created_by_subject',coalesce(v_family_linked_by_subject,false)
    ) into v_family;

    insert into public.system_admin_audit_log(source_system,severity,event_type,outcome,actor_type,actor_reference,details)
    values('club_check_in','info','personal_data_bundle_accessed','success','system_admin',v_parent_id::text,
      jsonb_build_object('subject_type','parent','linked_submissions',jsonb_array_length(v_submissions)));

    return jsonb_build_object('success',true,'subject_type','parent','account',v_account,
      'family',coalesce(v_family,'{}'::jsonb),
      'family_members',case when v_family_id is null then '[]'::jsonb else
        jsonb_build_array(jsonb_build_object('is_subject',true,'joined_at',v_family_joined_at,
          'link_created_by_subject',coalesce(v_family_linked_by_subject,false))) end,
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
      'review_notice','This export includes the family-sharing relationship for this parent account only. Other family members personal data, child records and submissions are excluded and require separate, appropriately verified requests. Older submissions not linked to this account are not included.');
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
