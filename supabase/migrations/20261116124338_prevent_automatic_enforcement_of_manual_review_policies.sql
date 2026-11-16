CREATE OR REPLACE FUNCTION public.update_retention_policy(system_admin_pin text, requested_policy_key text, requested_retention_value integer, requested_retention_unit text, requested_enabled boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE oldrow public.retention_policies%rowtype; newrow public.retention_policies%rowtype;
BEGIN
    IF NOT public._verify_system_admin_pin(system_admin_pin) THEN
        RETURN NULL;
    END IF;
    IF requested_retention_value IS NULL OR requested_retention_value<0 OR requested_retention_value>120 THEN
       RAISE EXCEPTION 'Retention value must be between 0 and 120';
    END IF;
    IF requested_retention_unit IS NULL OR length(trim(requested_retention_unit))<2 OR length(trim(requested_retention_unit))>80 THEN
       RAISE EXCEPTION 'Invalid retention unit';
    END IF;
    SELECT * INTO oldrow FROM public.retention_policies WHERE policy_key=requested_policy_key FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Retention policy not found'; END IF;
    IF oldrow.action='review' THEN RAISE EXCEPTION 'Manual-review policies do not have an automatic retention period. Configure only after a separately approved policy is adopted.'; END IF;
    UPDATE public.retention_policies
    SET retention_value=requested_retention_value,retention_unit=trim(requested_retention_unit),enabled=requested_enabled,
        policy_version=policy_version+1,updated_at=now(),updated_by='system_admin'
    WHERE policy_key=requested_policy_key RETURNING * INTO newrow;
    INSERT INTO public.system_admin_audit_log(source_system,severity,event_type,outcome,actor_type,details)
    VALUES('club_check_in','info','retention_policy_updated','success','system_admin',jsonb_build_object('policy_key',requested_policy_key));
    RETURN to_jsonb(newrow);
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_retention_enforcement(system_admin_pin text, requested_policy_key text, requested_enforcement boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v public.retention_policies%rowtype; m boolean;
BEGIN
    IF NOT public._verify_system_admin_pin(system_admin_pin) THEN
        RETURN NULL;
    END IF;
    SELECT must_change_pin INTO m FROM public.system_admin_credentials WHERE singleton=true;
    IF m THEN RAISE EXCEPTION 'Change the temporary System Admin PIN before changing enforcement settings'; END IF;
    IF requested_enforcement AND EXISTS(SELECT 1 FROM public.retention_policies WHERE policy_key=requested_policy_key AND action='review') THEN
      RAISE EXCEPTION 'Manual-review policies cannot be automatically enforced.';
    END IF;
    UPDATE public.retention_policies
    SET enforcement_enabled=requested_enforcement,policy_version=policy_version+1,updated_at=now(),updated_by='system_admin'
    WHERE policy_key=requested_policy_key RETURNING * INTO v;
    IF NOT FOUND THEN RAISE EXCEPTION 'Retention policy not found'; END IF;
    INSERT INTO public.system_admin_audit_log(source_system,severity,event_type,outcome,actor_type,details)
    VALUES('club_check_in','info','retention_enforcement_changed','success','system_admin',
           jsonb_build_object('policy_key',requested_policy_key,'enabled',requested_enforcement));
    RETURN to_jsonb(v);
END;
$function$;