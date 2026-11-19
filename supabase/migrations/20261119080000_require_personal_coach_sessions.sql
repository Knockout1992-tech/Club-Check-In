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
       OR cardinality(requested_age_groups) = 0
       OR EXISTS (
           SELECT 1 FROM unnest(requested_age_groups) x
           WHERE x IS NULL OR btrim(x) = ''
       ) THEN
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
       OR cardinality(requested_age_group_ids) = 0
       OR EXISTS (
           SELECT 1 FROM unnest(requested_age_group_ids) x
           WHERE x IS NULL
       ) THEN
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


-- Restrict Coach season-planner results to the age groups assigned to the
-- authenticated Coach. Shared events remain visible for assigned groups only.

CREATE OR REPLACE FUNCTION public.get_coach_season_planner(
    supplied_code text,
    requested_age_groups text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_season_id bigint;
    v_season jsonb;
    v_age_groups jsonb;
    v_events jsonb;
    v_selected_ids bigint[];
    v_active_count integer;
BEGIN
    IF public.verify_coach_age_groups_access(supplied_code, requested_age_groups) IS DISTINCT FROM true
       OR requested_age_groups IS NULL
       OR cardinality(requested_age_groups) = 0
       OR EXISTS (
           SELECT 1 FROM unnest(requested_age_groups) x
           WHERE x IS NULL OR btrim(x) = ''
       )
       OR cardinality(requested_age_groups) <> (
           SELECT count(DISTINCT btrim(x)) FROM unnest(requested_age_groups) x
       ) THEN
        RETURN NULL;
    END IF;

    SELECT array_agg(ag.id ORDER BY ag.sort_order)
      INTO v_selected_ids
    FROM public.age_groups ag
    WHERE ag.active = true
      AND (ag.age_group = ANY(requested_age_groups)
           OR ag.display_name = ANY(requested_age_groups));

    IF coalesce(cardinality(v_selected_ids), 0) <> cardinality(requested_age_groups) THEN
        RETURN NULL;
    END IF;

    SELECT s.id INTO v_season_id
    FROM public.seasons s
    WHERE s.is_current = true
    LIMIT 1;

    IF v_season_id IS NULL THEN
        RETURN NULL;
    END IF;

    SELECT jsonb_build_object(
        'id', s.id,
        'season_name', s.season_name,
        'start_date', coalesce(p.start_date, s.start_date),
        'end_date', p.end_date
    )
    INTO v_season
    FROM public.seasons s
    LEFT JOIN public.season_planner_periods p ON p.season_id = s.id
    WHERE s.id = v_season_id;

    SELECT count(*) INTO v_active_count
    FROM public.age_groups ag
    WHERE ag.active = true;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', ag.id,
        'age_group', ag.age_group,
        'display_name', ag.display_name,
        'sort_order', ag.sort_order
    ) ORDER BY ag.sort_order), '[]'::jsonb)
    INTO v_age_groups
    FROM public.age_groups ag
    WHERE ag.active = true
      AND ag.id = ANY(v_selected_ids);

    WITH event_groups AS (
        SELECT
            e.event_date,
            e.title,
            e.event_type,
            coalesce(e.match_location, '') AS match_location,
            e.start_time,
            e.end_time,
            coalesce(e.venue, '') AS venue,
            coalesce(e.notes, '') AS notes,
            coalesce(e.availability_enabled, true) AS availability_enabled,
            count(DISTINCT e.age_group_id) AS group_count,
            bool_or(e.age_group_id = ANY(v_selected_ids)) AS includes_selected
        FROM public.season_planner_events e
        JOIN public.age_groups ag ON ag.id = e.age_group_id AND ag.active = true
        WHERE e.season_id = v_season_id
        GROUP BY
            e.event_date, e.title, e.event_type, coalesce(e.match_location, ''),
            e.start_time, e.end_time, coalesce(e.venue, ''),
            coalesce(e.notes, ''), coalesce(e.availability_enabled, true)
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id,
        'schedule_id', e.schedule_id,
        'age_group_id', e.age_group_id,
        'age_group', ag.age_group,
        'display_name', ag.display_name,
        'event_date', e.event_date,
        'event_type', e.event_type,
        'title', e.title,
        'start_time', e.start_time,
        'end_time', e.end_time,
        'venue', e.venue,
        'match_location', e.match_location,
        'opposition', e.opposition,
        'notes', e.notes,
        'holiday_break_id', e.holiday_break_id,
        'availability_enabled', e.availability_enabled,
        'linked_fixture_id', lnk.fixture_id
    ) ORDER BY e.event_date, e.start_time, ag.sort_order), '[]'::jsonb)
    INTO v_events
    FROM public.season_planner_events e
    JOIN public.age_groups ag ON ag.id = e.age_group_id AND ag.active = true
    LEFT JOIN public.season_event_fixture_links lnk ON lnk.event_id = e.id
    LEFT JOIN event_groups eg
      ON eg.event_date = e.event_date
     AND eg.title = e.title
     AND eg.event_type = e.event_type
     AND eg.match_location = coalesce(e.match_location, '')
     AND eg.start_time IS NOT DISTINCT FROM e.start_time
     AND eg.end_time IS NOT DISTINCT FROM e.end_time
     AND eg.venue = coalesce(e.venue, '')
     AND eg.notes = coalesce(e.notes, '')
     AND eg.availability_enabled = coalesce(e.availability_enabled, true)
    WHERE e.season_id = v_season_id
      AND e.age_group_id = ANY(v_selected_ids)
      AND (coalesce(eg.includes_selected, false)
           OR coalesce(eg.group_count, 0) = v_active_count);

    RETURN jsonb_build_object(
        'season', v_season,
        'age_groups', v_age_groups,
        'events', v_events
    );
END;
$function$;
