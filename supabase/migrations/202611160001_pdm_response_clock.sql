-- PDM response-clock hardening.
-- Existing verified requests retain their original receipt date as the clock start.
alter table public.personal_data_requests
  add column if not exists clock_started_at timestamptz;

update public.personal_data_requests
set clock_started_at = received_at
where clock_started_at is null
  and identity_status = 'verified'
  and authority_status in ('verified','not_applicable');

create or replace function public.create_personal_data_request(
 p_system_admin_pin text, p_request_type text, p_subject_type text, p_subject_reference text,
 p_subject_name text, p_subject_locator jsonb, p_requester_name text, p_requester_relationship text,
 p_contact_method text, p_contact_details text, p_received_at timestamptz,
 p_identity_status text, p_authority_status text, p_scope_notes text
) returns jsonb language plpgsql security definer set search_path to ''
as $function$
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
   or (p_subject_locator->>'parent_name' is null and p_subject_locator->>'family_id' is null)) then
  return jsonb_build_object('success',false,'message','Parent Portal child selection is incomplete.'); end if;
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

create or replace function public.update_personal_data_request(
 p_system_admin_pin text, p_request_id bigint, p_status text, p_identity_status text,
 p_authority_status text, p_scope_notes text, p_extension_reason text,
 p_extension_notified_at timestamptz, p_decision text, p_response_notes text,
 p_sent_at timestamptz, p_sent_via text, p_completed_at timestamptz
) returns jsonb language plpgsql security definer set search_path to ''
as $function$
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
 v_clock:=v_request.clock_started_at;
 if v_clock is null and p_identity_status='verified' and p_authority_status in ('verified','not_applicable') then v_clock:=now(); end if;
 if p_extension_reason is not null and btrim(p_extension_reason)<>'' then
  if v_clock is null or length(btrim(p_extension_reason))<10 or p_extension_notified_at is null
   or p_extension_notified_at>now() or p_extension_notified_at>v_clock+interval '1 month' then
   return jsonb_build_object('success',false,'message','An extension needs a reason and must be notified within the first month after the response clock starts.');
  end if;
 end if;
 update public.personal_data_requests set status=p_status,identity_status=p_identity_status,authority_status=p_authority_status,
  clock_started_at=v_clock,due_at=case when v_clock is not null then v_clock+interval '1 month' else due_at end,
  scope_notes=nullif(btrim(p_scope_notes),''),extension_reason=nullif(btrim(p_extension_reason),''),
  extension_notified_at=p_extension_notified_at,
  extended_due_at=case when p_extension_reason is not null and btrim(p_extension_reason)<>'' then v_clock+interval '3 months' else null end,
  decision=nullif(btrim(p_decision),''),response_notes=nullif(btrim(p_response_notes),''),
  sent_at=p_sent_at,sent_via=nullif(btrim(p_sent_via),''),completed_at=p_completed_at,updated_at=now()
 where id=p_request_id returning * into v_request;
 if v_request.request_type='erasure' and v_request.erasure_executed_at is not null and p_status='completed' and p_sent_at is not null then
  update public.personal_data_requests set subject_name=null,subject_reference=null,subject_locator='{}'::jsonb,
   requester_name=null,contact_details=null,scope_notes=null,response_notes=null,decision='erasure_completed' where id=p_request_id;
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
