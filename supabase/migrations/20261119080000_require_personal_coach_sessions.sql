-- Require an individual authenticated Coach session for all Coach data access.
-- The shared Coach PIN is retained only for the first-time personal PIN setup flow.
-- Admin/Senior access remains unchanged.

CREATE OR REPLACE FUNCTION public.verify_coach_age_group_access(
    supplied_credential text,
    requested_age_group text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_client_info text;
    v_installation_id text;
    v_person_id text;
BEGIN
    IF supplied_credential IS NULL
       OR supplied_credential !~ '^[0-9a-f]{64}$'
       OR requested_age_group IS NULL
       OR btrim(requested_age_group) = '' THEN
        RETURN false;
    END IF;

    BEGIN
        v_client_info := current_setting('request.headers', true)::jsonb ->> 'x-client-info';
        v_installation_id := substring(
            coalesce(v_client_info, '')
            FROM 'club-check-in-installation=([A-Za-z0-9-]+)'
        );
    EXCEPTION WHEN OTHERS THEN
        v_installation_id := NULL;
    END;

    v_person_id := public.get_authenticated_person_id(
        supplied_credential, 'coach', v_installation_id
    );

    IF v_person_id IS NULL THEN
        RETURN false;
    END IF;

    RETURN EXISTS (
        SELECT 1
        FROM public.user_age_group_assignments a
        JOIN public.age_groups ag
          ON ag.id = a.age_group_id
         AND ag.active = true
        WHERE a.person_id = v_person_id
          AND (
              ag.age_group = btrim(requested_age_group)
              OR ag.display_name = btrim(requested_age_group)
              OR ag.id::text = btrim(requested_age_group)
          )
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_coach_age_groups_access(
    supplied_credential text,
    requested_age_groups text[]
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_client_info text;
    v_installation_id text;
    v_person_id text;
    v_requested_count integer;
    v_authorised_count integer;
BEGIN
    IF supplied_credential IS NULL
       OR supplied_credential !~ '^[0-9a-f]{64}$'
       OR requested_age_groups IS NULL
       OR cardinality(requested_age_groups) = 0 THEN
        RETURN false;
    END IF;

    BEGIN
        v_client_info := current_setting('request.headers', true)::jsonb ->> 'x-client-info';
        v_installation_id := substring(
            coalesce(v_client_info, '')
            FROM 'club-check-in-installation=([A-Za-z0-9-]+)'
        );
    EXCEPTION WHEN OTHERS THEN
        v_installation_id := NULL;
    END;

    v_person_id := public.get_authenticated_person_id(
        supplied_credential, 'coach', v_installation_id
    );

    IF v_person_id IS NULL THEN
        RETURN false;
    END IF;

    SELECT count(DISTINCT btrim(x))
      INTO v_requested_count
    FROM unnest(requested_age_groups) x
    WHERE x IS NOT NULL AND btrim(x) <> '';

    SELECT count(DISTINCT ag.id)
      INTO v_authorised_count
    FROM unnest(requested_age_groups) x
    JOIN public.age_groups ag
      ON ag.active = true
     AND (
         ag.age_group = btrim(x)
         OR ag.display_name = btrim(x)
         OR ag.id::text = btrim(x)
     )
    JOIN public.user_age_group_assignments a
      ON a.age_group_id = ag.id
     AND a.person_id = v_person_id;

    RETURN v_requested_count > 0
       AND v_authorised_count = v_requested_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_coach_age_group_ids_access(
    supplied_credential text,
    requested_age_group_ids bigint[]
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_client_info text;
    v_installation_id text;
    v_person_id text;
    v_requested_count integer;
    v_authorised_count integer;
BEGIN
    IF supplied_credential IS NULL
       OR supplied_credential !~ '^[0-9a-f]{64}$'
       OR requested_age_group_ids IS NULL
       OR cardinality(requested_age_group_ids) = 0 THEN
        RETURN false;
    END IF;

    BEGIN
        v_client_info := current_setting('request.headers', true)::jsonb ->> 'x-client-info';
        v_installation_id := substring(
            coalesce(v_client_info, '')
            FROM 'club-check-in-installation=([A-Za-z0-9-]+)'
        );
    EXCEPTION WHEN OTHERS THEN
        v_installation_id := NULL;
    END;

    v_person_id := public.get_authenticated_person_id(
        supplied_credential, 'coach', v_installation_id
    );

    IF v_person_id IS NULL THEN
        RETURN false;
    END IF;

    SELECT count(DISTINCT x)
      INTO v_requested_count
    FROM unnest(requested_age_group_ids) x;

    SELECT count(DISTINCT ag.id)
      INTO v_authorised_count
    FROM unnest(requested_age_group_ids) x
    JOIN public.age_groups ag
      ON ag.id = x AND ag.active = true
    JOIN public.user_age_group_assignments a
      ON a.age_group_id = ag.id
     AND a.person_id = v_person_id;

    RETURN v_requested_count > 0
       AND v_authorised_count = v_requested_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.verify_coach_register_access(
    supplied_credential text,
    requested_register_id bigint
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_age_group text;
BEGIN
    IF supplied_credential IS NULL
       OR supplied_credential !~ '^[0-9a-f]{64}$'
       OR requested_register_id IS NULL THEN
        RETURN false;
    END IF;

    SELECT age_group
      INTO v_age_group
    FROM public.attendance_registers
    WHERE id = requested_register_id;

    IF v_age_group IS NULL THEN
        RETURN false;
    END IF;

    RETURN public.verify_coach_age_group_access(
        supplied_credential, v_age_group
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.load_players(
    supplied_code text,
    supplied_role text
)
RETURNS TABLE(
    player_id text,
    name text,
    age_group text,
    gms boolean,
    coach_gms_suggestion boolean,
    active boolean,
    archived boolean,
    last_attendance_date date
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_client_info text;
    v_installation_id text;
    v_person_id text;
BEGIN
    IF supplied_role IS NULL OR supplied_role NOT IN ('coach', 'senior') THEN
        RETURN;
    END IF;

    IF supplied_code IS NULL
       OR (supplied_role = 'coach' AND supplied_code !~ '^[0-9a-f]{64}$')
       OR public.verify_access_code(supplied_code, supplied_role) IS DISTINCT FROM true THEN
        RETURN;
    END IF;

    IF supplied_code ~ '^[0-9a-f]{64}$' THEN
        BEGIN
            v_client_info := current_setting('request.headers', true)::jsonb ->> 'x-client-info';
            v_installation_id := substring(
                coalesce(v_client_info, '')
                FROM 'club-check-in-installation=([A-Za-z0-9-]+)'
            );
        EXCEPTION WHEN OTHERS THEN
            v_installation_id := NULL;
        END;

        v_person_id := public.get_authenticated_person_id(
            supplied_code, supplied_role, v_installation_id
        );

        IF v_person_id IS NULL THEN
            RETURN;
        END IF;
    END IF;

    RETURN QUERY
    SELECT
        p.player_id,
        p.name,
        p.age_group,
        p.gms,
        p.coach_gms_suggestion,
        p.active,
        p.archived,
        p.last_attendance_date
    FROM public.players p
    WHERE supplied_role = 'senior'
       OR EXISTS (
           SELECT 1
           FROM public.user_age_group_assignments a
           JOIN public.age_groups ag
             ON ag.id = a.age_group_id
            AND ag.active = true
           WHERE a.person_id = v_person_id
             AND ag.age_group = p.age_group
       )
    ORDER BY p.age_group, p.name;
END;
$function$;
