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
   requester_name=NULL,contact_details=NULL,scope_notes=NULL,response_notes=NULL,decision_reason=NULL,
   decision='erasure_completed'
  WHERE id=p_request_id;
 END IF;
 INSERT INTO public.system_admin_audit_log(source_system,severity,event_type,outcome,actor_type,request_id,details)
 VALUES('club_check_in','info','personal_data_response_sent','success','system_admin',r.request_ref,
  jsonb_build_object('decision',p_decision,'status',v_status,'sent_via',p_sent_via,
   'access_copy_confirmed',coalesce(p_access_copy_confirmed,false),'third_party_reviewed',true,'accuracy_confirmed',true));
 RETURN jsonb_build_object('success',true,'request_ref',r.request_ref,'status',v_status,'sent_at',now());
END;$function$;