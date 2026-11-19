-- Revoke all existing access when an approved user is deactivated.
-- Reactivation does not restore old sessions or passkeys; the user must sign in
-- again with their personal PIN and may register a passkey again.

CREATE OR REPLACE FUNCTION public.set_manageable_user_active(
    current_senior_code text,
    requested_person_id text,
    requested_active boolean,
    supplied_installation_id text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_actor_person_id text;
    v_actor_name text;
    v_target_name text;
    v_previous_active boolean;
    v_protected boolean;
BEGIN
    IF current_senior_code IS NULL OR btrim(current_senior_code) = ''
       OR requested_person_id IS NULL OR btrim(requested_person_id) = ''
       OR requested_active IS NULL
       OR supplied_installation_id IS NULL OR btrim(supplied_installation_id) = '' THEN
        RETURN false;
    END IF;

    IF NOT public.verify_access_code(current_senior_code, 'senior') THEN
        RETURN false;
    END IF;

    v_actor_person_id := public.get_authenticated_person_id(
        current_senior_code, 'senior', supplied_installation_id
    );

    IF v_actor_person_id IS NULL THEN
        RETURN false;
    END IF;

    SELECT u.name
      INTO v_actor_name
    FROM public.approved_users u
    JOIN public.user_role_assignments r ON r.person_id = u.person_id
    WHERE u.person_id = v_actor_person_id
      AND u.active = true
      AND r.role_key = 'admin'
    LIMIT 1;

    IF v_actor_name IS NULL THEN
        RETURN false;
    END IF;

    SELECT u.name, u.active, u.protected_user
      INTO v_target_name, v_previous_active, v_protected
    FROM public.approved_users u
    WHERE u.person_id = btrim(requested_person_id)
    FOR UPDATE;

    IF NOT FOUND OR coalesce(v_protected, true) THEN
        RETURN false;
    END IF;

    IF v_previous_active IS NOT DISTINCT FROM requested_active THEN
        RETURN true;
    END IF;

    UPDATE public.approved_users
       SET active = requested_active,
           updated_at = now()
     WHERE person_id = btrim(requested_person_id)
       AND protected_user = false;

    IF requested_active = false THEN
        UPDATE public.user_auth_sessions
           SET revoked_at = coalesce(revoked_at, now())
         WHERE person_id = btrim(requested_person_id)
           AND revoked_at IS NULL;

        UPDATE public.installation_user_access
           SET active = false
         WHERE person_id = btrim(requested_person_id)
           AND active = true;

        UPDATE public.club_checkin_passkeys
           SET active = false
         WHERE person_id = btrim(requested_person_id)
           AND active = true;
    END IF;

    INSERT INTO public.system_admin_audit_log (
        source_system, severity, event_type, outcome,
        actor_type, actor_reference, details
    )
    VALUES (
        'club_check_in',
        'info',
        CASE WHEN requested_active THEN 'Set active user' ELSE 'Set inactive user' END,
        'success',
        'approved_user',
        v_actor_person_id,
        jsonb_build_object(
            'actor_name', v_actor_name,
            'actor_person_id', v_actor_person_id,
            'actor_installation_id', btrim(supplied_installation_id),
            'target_name', v_target_name,
            'target_person_id', btrim(requested_person_id),
            'previous_active', v_previous_active,
            'new_active', requested_active,
            'sessions_revoked', NOT requested_active,
            'installation_access_disabled', NOT requested_active,
            'passkeys_disabled', NOT requested_active
        )
    );

    RETURN true;
END;
$function$;
