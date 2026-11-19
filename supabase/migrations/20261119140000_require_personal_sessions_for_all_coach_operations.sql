CREATE OR REPLACE FUNCTION public.get_authenticated_person_id(
    supplied_credential text,
    required_access_role text,
    supplied_installation_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_person_id text;
    v_required_role text;
    v_token_hash text;
BEGIN
    IF supplied_credential IS NULL
       OR required_access_role NOT IN ('coach','senior')
       OR supplied_installation_id IS NULL
       OR btrim(supplied_installation_id) = '' THEN
        RETURN NULL;
    END IF;

    -- Coach access must always be tied to an individual personal session.
    -- The shared Coach PIN remains available only to the one-time personal
    -- PIN setup verifier, never to attendance, player or fixture operations.
    IF required_access_role = 'coach'
       AND supplied_credential !~ '^[0-9a-f]{64}$' THEN
        RETURN NULL;
    END IF;

    IF supplied_credential ~ '^[0-9a-f]{64}$' THEN
        v_token_hash := encode(
            extensions.digest(convert_to(supplied_credential,'UTF8'),'sha256'),
            'hex'
        );
        v_required_role := CASE
            WHEN required_access_role = 'senior' THEN 'admin'
            ELSE 'coach'
        END;

        SELECT s.person_id
          INTO v_person_id
        FROM public.user_auth_sessions s
        JOIN public.approved_users u ON u.person_id = s.person_id
        JOIN public.installation_user_access a
          ON a.person_id = s.person_id
         AND a.installation_id = s.installation_id
         AND a.active = true
        JOIN public.user_role_assignments r
          ON r.person_id = s.person_id
         AND r.role_key = v_required_role
        WHERE s.token_hash = v_token_hash
          AND s.installation_id = btrim(supplied_installation_id)
          AND s.expires_at > now()
          AND s.revoked_at IS NULL
          AND u.active = true
        LIMIT 1;

        RETURN v_person_id;
    END IF;

    -- Preserve the protected Senior/Admin legacy credential path.
    IF public.verify_access_code_for_installation(
        supplied_credential, required_access_role, supplied_installation_id
    ) IS DISTINCT FROM true THEN
        RETURN NULL;
    END IF;

    SELECT i.person_id
      INTO v_person_id
    FROM public.installations i
    JOIN public.approved_users u
      ON u.person_id = i.person_id
     AND u.active = true
    JOIN public.installation_user_access a
      ON a.installation_id = i.installation_id
     AND a.person_id = i.person_id
     AND a.active = true
    WHERE i.installation_id = btrim(supplied_installation_id)
      AND i.active = true
    LIMIT 1;

    RETURN v_person_id;
END;
$function$;
