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
       OR new_system_admin_pin !~ '^[0-9]{4}$' THEN
        RAISE EXCEPTION 'Choose exactly a 4 digit PIN.';
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
