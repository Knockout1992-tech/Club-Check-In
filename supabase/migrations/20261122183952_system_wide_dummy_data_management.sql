CREATE OR REPLACE FUNCTION public.preserve_dummy_identifier_prefix()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
    v_column text := TG_ARGV[0];
    v_marker_column text := nullif(TG_ARGV[1], '');
    v_old_value text;
    v_new_value text;
    v_is_dummy boolean := false;
BEGIN
    v_old_value := to_jsonb(OLD) ->> v_column;
    v_new_value := to_jsonb(NEW) ->> v_column;

    IF v_marker_column IS NOT NULL THEN
        v_is_dummy := coalesce((to_jsonb(OLD) ->> v_marker_column)::boolean, false);
    END IF;

    IF (v_is_dummy OR upper(ltrim(coalesce(v_old_value, ''))) LIKE 'DUMMY%')
       AND upper(ltrim(coalesce(v_new_value, ''))) NOT LIKE 'DUMMY%' THEN
        NEW := jsonb_populate_record(
            NEW,
            jsonb_build_object(v_column, 'DUMMY - ' || btrim(coalesce(v_new_value, '')))
        );
    END IF;

    IF v_marker_column IS NOT NULL
       AND upper(ltrim(coalesce(v_new_value, ''))) LIKE 'DUMMY%' THEN
        NEW := jsonb_populate_record(NEW, jsonb_build_object(v_marker_column, true));
    END IF;

    RETURN NEW;
END;
$function$;


CREATE OR REPLACE FUNCTION public.save_first_aider(system_admin_pin text, requested_id bigint, requested_name text, requested_main_age_group_id bigint, requested_main_pitch text, requested_additional_assignments jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_id bigint;
    v_must_change boolean;
    v_item record;
    v_name text;
    v_is_dummy boolean;
BEGIN
    IF NOT public._verify_system_admin_pin(system_admin_pin) THEN
        RETURN NULL;
    END IF;

    SELECT must_change_pin INTO v_must_change
    FROM public.system_admin_credentials WHERE singleton = true;
    IF coalesce(v_must_change, false) THEN
        RAISE EXCEPTION 'Change the temporary System Admin PIN before managing first-aider records';
    END IF;

    IF requested_name IS NULL OR length(btrim(requested_name)) NOT BETWEEN 1 AND 80 THEN
        RAISE EXCEPTION 'Enter a valid first-aider name';
    END IF;
    IF requested_main_pitch IS NOT NULL AND length(btrim(requested_main_pitch)) > 80 THEN
        RAISE EXCEPTION 'Pitch must be 80 characters or fewer';
    END IF;
    IF requested_additional_assignments IS NULL
       OR jsonb_typeof(requested_additional_assignments) <> 'array'
       OR jsonb_array_length(requested_additional_assignments) > 12 THEN
        RAISE EXCEPTION 'Invalid additional age-group assignments';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.age_groups
        WHERE id = requested_main_age_group_id AND active = true
    ) THEN
        RAISE EXCEPTION 'Select an active main age group';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(requested_additional_assignments)
             AS x(age_group_id bigint, pitch text)
        LEFT JOIN public.age_groups g ON g.id = x.age_group_id AND g.active = true
        WHERE g.id IS NULL
           OR x.age_group_id = requested_main_age_group_id
           OR (x.pitch IS NOT NULL AND length(btrim(x.pitch)) > 80)
    ) THEN
        RAISE EXCEPTION 'One or more additional age-group assignments are invalid';
    END IF;

    IF (
        SELECT count(*) FROM jsonb_to_recordset(requested_additional_assignments)
             AS x(age_group_id bigint, pitch text)
    ) <> (
        SELECT count(DISTINCT x.age_group_id)
        FROM jsonb_to_recordset(requested_additional_assignments)
             AS x(age_group_id bigint, pitch text)
    ) THEN
        RAISE EXCEPTION 'An age group can only be assigned once to a volunteer';
    END IF;

    IF requested_id IS NULL THEN
        v_is_dummy := upper(ltrim(btrim(requested_name))) LIKE 'DUMMY%';
        v_name := CASE WHEN v_is_dummy THEN btrim(requested_name) ELSE btrim(requested_name) END;
        INSERT INTO public.first_aider_volunteers(name, is_dummy)
        VALUES (v_name, v_is_dummy)
        RETURNING id INTO v_id;
    ELSE
        SELECT (is_dummy OR upper(ltrim(name)) LIKE 'DUMMY%')
        INTO v_is_dummy
        FROM public.first_aider_volunteers
        WHERE id = requested_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'First-aider record not found';
        END IF;

        v_name := CASE
            WHEN v_is_dummy AND upper(ltrim(btrim(requested_name))) NOT LIKE 'DUMMY%'
                THEN 'DUMMY - ' || btrim(requested_name)
            ELSE btrim(requested_name)
        END;

        UPDATE public.first_aider_volunteers
        SET name = v_name,
            is_dummy = v_is_dummy,
            updated_at = now()
        WHERE id = requested_id
        RETURNING id INTO v_id;
    END IF;

    DELETE FROM public.first_aider_age_group_assignments WHERE volunteer_id = v_id;

    INSERT INTO public.first_aider_age_group_assignments
        (volunteer_id, age_group_id, is_main, pitch)
    VALUES (
        v_id,
        requested_main_age_group_id,
        true,
        nullif(btrim(coalesce(requested_main_pitch, '')), '')
    );

    INSERT INTO public.first_aider_age_group_assignments
        (volunteer_id, age_group_id, is_main, pitch)
    SELECT
        v_id,
        x.age_group_id,
        false,
        nullif(btrim(coalesce(x.pitch, '')), '')
    FROM jsonb_to_recordset(requested_additional_assignments)
         AS x(age_group_id bigint, pitch text);

    INSERT INTO public.system_admin_audit_log
        (source_system, severity, event_type, outcome, actor_type, details)
    VALUES (
        'club_check_in',
        'info',
        CASE WHEN requested_id IS NULL THEN 'first_aider_created' ELSE 'first_aider_updated' END,
        'success',
        'system_admin',
        jsonb_build_object(
            'volunteer_id', v_id,
            'main_age_group_id', requested_main_age_group_id,
            'additional_count', jsonb_array_length(requested_additional_assignments),
            'is_dummy', v_is_dummy
        )
    );

    RETURN jsonb_build_object('success', true, 'id', v_id, 'is_dummy', v_is_dummy);
END;
$function$;


CREATE OR REPLACE FUNCTION public.set_first_aider_active(system_admin_pin text, requested_id bigint, requested_active boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_must_change boolean;
    v_id bigint;
BEGIN
    IF NOT public._verify_system_admin_pin(system_admin_pin) THEN
        RETURN NULL;
    END IF;

    SELECT must_change_pin INTO v_must_change
    FROM public.system_admin_credentials WHERE singleton = true;
    IF coalesce(v_must_change, false) THEN
        RAISE EXCEPTION 'Change the temporary System Admin PIN before managing first-aider records';
    END IF;

    UPDATE public.first_aider_volunteers
    SET active = requested_active, updated_at = now()
    WHERE id = requested_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
        RAISE EXCEPTION 'First-aider record not found or cannot be changed';
    END IF;

    INSERT INTO public.system_admin_audit_log
        (source_system, severity, event_type, outcome, actor_type, details)
    VALUES (
        'club_check_in',
        'info',
        'first_aider_status_changed',
        'success',
        'system_admin',
        jsonb_build_object('volunteer_id', v_id, 'active', requested_active)
    );

    RETURN jsonb_build_object('success', true, 'id', v_id, 'active', requested_active);
END;
$function$;


CREATE OR REPLACE FUNCTION public.get_dummy_data_summary(system_admin_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_must_change boolean;
    v_players integer;
    v_attendance integer;
    v_registers integer;
    v_fixtures integer;
    v_submissions integer;
    v_availability integer;
    v_events integer;
    v_schedules integer;
    v_breaks integer;
    v_seasons integer;
    v_first_aiders integer;
    v_notifications integer;
    v_protected integer;
    v_age_groups integer;
BEGIN
    IF NOT public._verify_system_admin_pin(system_admin_pin) THEN
        RETURN NULL;
    END IF;

    SELECT must_change_pin INTO v_must_change
    FROM public.system_admin_credentials WHERE singleton = true;
    IF coalesce(v_must_change, false) THEN
        RAISE EXCEPTION 'Change the temporary System Admin PIN before managing DUMMY data';
    END IF;

    SELECT count(*) INTO v_players
    FROM public.players WHERE btrim(name) ILIKE 'DUMMY%';

    SELECT count(*) INTO v_attendance
    FROM public.attendance_records ar
    JOIN public.players p ON p.player_id = ar.player_id
    WHERE btrim(p.name) ILIKE 'DUMMY%'
       OR ar.register_id IN (
            SELECT r.id
            FROM public.attendance_registers r
            JOIN public.seasons s ON s.id = r.season_id
            WHERE btrim(s.season_name) ILIKE 'DUMMY%'
       );

    SELECT count(DISTINCT ar.register_id) INTO v_registers
    FROM public.attendance_records ar
    JOIN public.players p ON p.player_id = ar.player_id
    WHERE btrim(p.name) ILIKE 'DUMMY%'
       OR ar.register_id IN (
            SELECT r.id
            FROM public.attendance_registers r
            JOIN public.seasons s ON s.id = r.season_id
            WHERE btrim(s.season_name) ILIKE 'DUMMY%'
       );

    SELECT count(*) INTO v_fixtures
    FROM public.match_fixtures WHERE btrim(opposition) ILIKE 'DUMMY%';

    SELECT count(*) INTO v_submissions
    FROM public.match_submissions s
    WHERE btrim(s.parent_name) ILIKE 'DUMMY%'
       OR s.fixture_id IN (
            SELECT f.id FROM public.match_fixtures f
            WHERE btrim(f.opposition) ILIKE 'DUMMY%'
       );

    SELECT count(*) INTO v_availability
    FROM public.match_availability a
    WHERE btrim(a.child_name) ILIKE 'DUMMY%'
       OR a.submission_id IN (
            SELECT s.id
            FROM public.match_submissions s
            WHERE btrim(s.parent_name) ILIKE 'DUMMY%'
               OR s.fixture_id IN (
                    SELECT f.id FROM public.match_fixtures f
                    WHERE btrim(f.opposition) ILIKE 'DUMMY%'
               )
       );

    SELECT count(*) INTO v_schedules
    FROM public.season_planner_schedules WHERE btrim(schedule_name) ILIKE 'DUMMY%';

    SELECT count(*) INTO v_breaks
    FROM public.season_planner_breaks WHERE btrim(label) ILIKE 'DUMMY%';

    SELECT count(*) INTO v_seasons
    FROM public.seasons WHERE btrim(season_name) ILIKE 'DUMMY%';

    SELECT count(*) INTO v_events
    FROM public.season_planner_events e
    WHERE btrim(coalesce(e.title, '')) ILIKE 'DUMMY%'
       OR btrim(coalesce(e.opposition, '')) ILIKE 'DUMMY%'
       OR e.schedule_id IN (
            SELECT id FROM public.season_planner_schedules
            WHERE btrim(schedule_name) ILIKE 'DUMMY%'
       )
       OR e.holiday_break_id IN (
            SELECT id FROM public.season_planner_breaks
            WHERE btrim(label) ILIKE 'DUMMY%'
       )
       OR e.season_id IN (
            SELECT id FROM public.seasons
            WHERE btrim(season_name) ILIKE 'DUMMY%'
       );

    SELECT count(*) INTO v_first_aiders
    FROM public.first_aider_volunteers
    WHERE is_dummy = true OR btrim(name) ILIKE 'DUMMY%';

    SELECT count(*) INTO v_notifications
    FROM public.coach_notification_outbox n
    WHERE btrim(n.event_title) ILIKE 'DUMMY%'
       OR n.fixture_id IN (
            SELECT id FROM public.match_fixtures
            WHERE btrim(opposition) ILIKE 'DUMMY%'
       )
       OR (n.source_type = 'season_planner' AND n.source_id IN (
            SELECT id FROM public.season_planner_events
            WHERE btrim(coalesce(title, '')) ILIKE 'DUMMY%'
               OR btrim(coalesce(opposition, '')) ILIKE 'DUMMY%'
               OR schedule_id IN (
                    SELECT id FROM public.season_planner_schedules
                    WHERE btrim(schedule_name) ILIKE 'DUMMY%'
               )
               OR holiday_break_id IN (
                    SELECT id FROM public.season_planner_breaks
                    WHERE btrim(label) ILIKE 'DUMMY%'
               )
               OR season_id IN (
                    SELECT id FROM public.seasons
                    WHERE btrim(season_name) ILIKE 'DUMMY%'
               )
       ));

    SELECT
        (SELECT count(*) FROM public.approved_users WHERE btrim(name) ILIKE 'DUMMY%') +
        (SELECT count(*) FROM public.match_parent_access WHERE btrim(parent_name) ILIKE 'DUMMY%') +
        (SELECT count(*) FROM public.personal_data_requests
         WHERE btrim(coalesce(subject_name, '')) ILIKE 'DUMMY%'
            OR btrim(coalesce(requester_name, '')) ILIKE 'DUMMY%')
    INTO v_protected;

    SELECT count(*) INTO v_age_groups
    FROM public.age_groups
    WHERE btrim(age_group) ILIKE 'DUMMY%'
       OR btrim(coalesce(display_name, '')) ILIKE 'DUMMY%';

    RETURN jsonb_build_object(
        'players', v_players,
        'attendance_records', v_attendance,
        'attendance_registers_affected', v_registers,
        'match_fixtures', v_fixtures,
        'match_submissions', v_submissions,
        'match_availability', v_availability,
        'season_planner_events', v_events,
        'season_planner_schedules', v_schedules,
        'season_planner_breaks', v_breaks,
        'seasons', v_seasons,
        'first_aider_volunteers', v_first_aiders,
        'coach_notifications', v_notifications,
        'protected_access_and_case_records', v_protected,
        'protected_age_group_configuration', v_age_groups
    );
END;
$function$;


CREATE OR REPLACE FUNCTION public.clear_dummy_data(system_admin_pin text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
    v_must_change boolean;
    v_player_ids text[] := ARRAY[]::text[];
    v_attendance_record_ids bigint[] := ARRAY[]::bigint[];
    v_register_ids bigint[] := ARRAY[]::bigint[];
    v_dummy_season_register_ids bigint[] := ARRAY[]::bigint[];
    v_fixture_ids bigint[] := ARRAY[]::bigint[];
    v_submission_ids bigint[] := ARRAY[]::bigint[];
    v_availability_ids bigint[] := ARRAY[]::bigint[];
    v_event_ids bigint[] := ARRAY[]::bigint[];
    v_schedule_ids bigint[] := ARRAY[]::bigint[];
    v_break_ids bigint[] := ARRAY[]::bigint[];
    v_season_ids bigint[] := ARRAY[]::bigint[];
    v_first_aider_ids bigint[] := ARRAY[]::bigint[];
    v_deleted_players integer := 0;
    v_deleted_attendance integer := 0;
    v_updated_history integer := 0;
    v_deleted_history integer := 0;
    v_deleted_registers integer := 0;
    v_deleted_availability integer := 0;
    v_deleted_submissions integer := 0;
    v_deleted_fixtures integer := 0;
    v_deleted_events integer := 0;
    v_deleted_schedules integer := 0;
    v_deleted_breaks integer := 0;
    v_deleted_seasons integer := 0;
    v_deleted_first_aiders integer := 0;
    v_deleted_notifications integer := 0;
BEGIN
    IF NOT public._verify_system_admin_pin(system_admin_pin) THEN
        RETURN NULL;
    END IF;

    SELECT must_change_pin INTO v_must_change
    FROM public.system_admin_credentials WHERE singleton = true;
    IF coalesce(v_must_change, false) THEN
        RAISE EXCEPTION 'Change the temporary System Admin PIN before clearing DUMMY data';
    END IF;

    SELECT coalesce(array_agg(player_id), ARRAY[]::text[])
    INTO v_player_ids
    FROM public.players WHERE btrim(name) ILIKE 'DUMMY%';

    SELECT coalesce(array_agg(id), ARRAY[]::bigint[])
    INTO v_fixture_ids
    FROM public.match_fixtures WHERE btrim(opposition) ILIKE 'DUMMY%';

    SELECT coalesce(array_agg(id), ARRAY[]::bigint[])
    INTO v_submission_ids
    FROM public.match_submissions
    WHERE btrim(parent_name) ILIKE 'DUMMY%'
       OR fixture_id = ANY(v_fixture_ids);

    SELECT coalesce(array_agg(id), ARRAY[]::bigint[])
    INTO v_availability_ids
    FROM public.match_availability
    WHERE btrim(child_name) ILIKE 'DUMMY%'
       OR submission_id = ANY(v_submission_ids);

    SELECT coalesce(array_agg(id), ARRAY[]::bigint[])
    INTO v_schedule_ids
    FROM public.season_planner_schedules WHERE btrim(schedule_name) ILIKE 'DUMMY%';

    SELECT coalesce(array_agg(id), ARRAY[]::bigint[])
    INTO v_break_ids
    FROM public.season_planner_breaks WHERE btrim(label) ILIKE 'DUMMY%';

    SELECT coalesce(array_agg(id), ARRAY[]::bigint[])
    INTO v_season_ids
    FROM public.seasons WHERE btrim(season_name) ILIKE 'DUMMY%';

    SELECT coalesce(array_agg(id), ARRAY[]::bigint[])
    INTO v_event_ids
    FROM public.season_planner_events e
    WHERE btrim(coalesce(e.title, '')) ILIKE 'DUMMY%'
       OR btrim(coalesce(e.opposition, '')) ILIKE 'DUMMY%'
       OR e.schedule_id = ANY(v_schedule_ids)
       OR e.holiday_break_id = ANY(v_break_ids)
       OR e.season_id = ANY(v_season_ids);

    SELECT coalesce(array_agg(id), ARRAY[]::bigint[])
    INTO v_first_aider_ids
    FROM public.first_aider_volunteers
    WHERE is_dummy = true OR btrim(name) ILIKE 'DUMMY%';

    SELECT coalesce(array_agg(id), ARRAY[]::bigint[])
    INTO v_dummy_season_register_ids
    FROM public.attendance_registers
    WHERE season_id = ANY(v_season_ids);

    SELECT coalesce(array_agg(DISTINCT r.id), ARRAY[]::bigint[])
    INTO v_register_ids
    FROM public.attendance_registers r
    WHERE r.id IN (
        SELECT ar.register_id
        FROM public.attendance_records ar
        WHERE ar.player_id = ANY(v_player_ids)
    )
    OR r.id = ANY(v_dummy_season_register_ids);

    SELECT coalesce(array_agg(ar.id), ARRAY[]::bigint[])
    INTO v_attendance_record_ids
    FROM public.attendance_records ar
    WHERE ar.player_id = ANY(v_player_ids)
       OR ar.register_id = ANY(v_dummy_season_register_ids);

    -- Do not remove genuine responses attached to a DUMMY parent or fixture.
    IF EXISTS (
        SELECT 1
        FROM public.match_submissions s
        WHERE btrim(s.parent_name) ILIKE 'DUMMY%'
          AND EXISTS (
              SELECT 1 FROM public.match_availability a
              WHERE a.submission_id = s.id
                AND btrim(a.child_name) NOT ILIKE 'DUMMY%'
          )
    ) OR EXISTS (
        SELECT 1
        FROM public.match_submissions s
        WHERE s.fixture_id = ANY(v_fixture_ids)
          AND (
              btrim(s.parent_name) NOT ILIKE 'DUMMY%'
              OR EXISTS (
                  SELECT 1 FROM public.match_availability a
                  WHERE a.submission_id = s.id
                    AND btrim(a.child_name) NOT ILIKE 'DUMMY%'
              )
          )
    ) THEN
        RAISE EXCEPTION 'DUMMY cleanup paused: a DUMMY parent or fixture is linked to a non-DUMMY response. No records were changed.';
    END IF;

    -- A DUMMY season is only removable when it is not current and contains no genuine attendance.
    IF EXISTS (
        SELECT 1 FROM public.seasons
        WHERE id = ANY(v_season_ids) AND is_current = true
    ) OR EXISTS (
        SELECT 1
        FROM public.attendance_registers r
        JOIN public.attendance_records ar ON ar.register_id = r.id
        JOIN public.players p ON p.player_id = ar.player_id
        WHERE r.season_id = ANY(v_season_ids)
          AND btrim(p.name) NOT ILIKE 'DUMMY%'
    ) THEN
        RAISE EXCEPTION 'DUMMY cleanup paused: a DUMMY season is current or contains genuine attendance. No records were changed.';
    END IF;

    -- Retention holds block the entire transaction; no hold is bypassed.
    IF EXISTS (
        SELECT 1
        FROM public.retention_holds h
        WHERE h.status = 'active'
          AND (
              (h.target_table = 'players' AND h.target_reference = ANY(v_player_ids))
              OR (h.target_table = 'attendance_records' AND h.target_reference IN (
                    SELECT x::text FROM unnest(v_attendance_record_ids) AS x
              ))
              OR (h.target_table = 'match_fixtures' AND h.target_reference IN (
                    SELECT x::text FROM unnest(v_fixture_ids) AS x
              ))
              OR (h.target_table = 'match_submissions' AND h.target_reference IN (
                    SELECT x::text FROM unnest(v_submission_ids) AS x
              ))
              OR (h.target_table = 'match_availability' AND h.target_reference IN (
                    SELECT x::text FROM unnest(v_availability_ids) AS x
              ))
              OR (h.target_table = 'season_planner_events' AND h.target_reference IN (
                    SELECT x::text FROM unnest(v_event_ids) AS x
              ))
              OR (h.target_table = 'season_planner_schedules' AND h.target_reference IN (
                    SELECT x::text FROM unnest(v_schedule_ids) AS x
              ))
              OR (h.target_table = 'season_planner_breaks' AND h.target_reference IN (
                    SELECT x::text FROM unnest(v_break_ids) AS x
              ))
              OR (h.target_table = 'seasons' AND h.target_reference IN (
                    SELECT x::text FROM unnest(v_season_ids) AS x
              ))
              OR (h.target_table = 'first_aider_volunteers' AND h.target_reference IN (
                    SELECT x::text FROM unnest(v_first_aider_ids) AS x
              ))
          )
    ) THEN
        RAISE EXCEPTION 'DUMMY cleanup paused: one or more matching records have an active retention hold. No records were changed.';
    END IF;

    DELETE FROM public.coach_notification_outbox n
    WHERE btrim(n.event_title) ILIKE 'DUMMY%'
       OR n.fixture_id = ANY(v_fixture_ids)
       OR (n.source_type = 'season_planner' AND n.source_id = ANY(v_event_ids));
    GET DIAGNOSTICS v_deleted_notifications = ROW_COUNT;

    DELETE FROM public.match_availability
    WHERE id = ANY(v_availability_ids);
    GET DIAGNOSTICS v_deleted_availability = ROW_COUNT;

    DELETE FROM public.match_submissions
    WHERE id = ANY(v_submission_ids);
    GET DIAGNOSTICS v_deleted_submissions = ROW_COUNT;

    DELETE FROM public.season_planner_events
    WHERE id = ANY(v_event_ids);
    GET DIAGNOSTICS v_deleted_events = ROW_COUNT;

    DELETE FROM public.season_planner_schedules
    WHERE id = ANY(v_schedule_ids);
    GET DIAGNOSTICS v_deleted_schedules = ROW_COUNT;

    DELETE FROM public.season_planner_breaks
    WHERE id = ANY(v_break_ids);
    GET DIAGNOSTICS v_deleted_breaks = ROW_COUNT;

    -- Remove only attendance belonging to DUMMY players or an entirely DUMMY season.
    DELETE FROM public.attendance_records
    WHERE player_id = ANY(v_player_ids)
       OR register_id = ANY(v_dummy_season_register_ids);
    GET DIAGNOSTICS v_deleted_attendance = ROW_COUNT;

    -- Recalculate retained historical summaries for mixed registers.
    UPDATE public.attendance_history h
    SET total_players = (
            SELECT count(*)::integer
            FROM public.attendance_records ar
            WHERE ar.register_id = h.register_id
        ),
        present_count = (
            SELECT count(*)::integer
            FROM public.attendance_records ar
            WHERE ar.register_id = h.register_id AND ar.present = true
        ),
        absent_count = (
            SELECT count(*)::integer
            FROM public.attendance_records ar
            WHERE ar.register_id = h.register_id AND ar.present = false
        )
    WHERE h.register_id = ANY(v_register_ids)
      AND h.register_id <> ALL(v_dummy_season_register_ids);
    GET DIAGNOSTICS v_updated_history = ROW_COUNT;

    DELETE FROM public.attendance_history
    WHERE register_id = ANY(v_dummy_season_register_ids);
    GET DIAGNOSTICS v_deleted_history = ROW_COUNT;

    DELETE FROM public.attendance_registers
    WHERE id = ANY(v_dummy_season_register_ids);
    GET DIAGNOSTICS v_deleted_registers = ROW_COUNT;

    DELETE FROM public.players
    WHERE player_id = ANY(v_player_ids);
    GET DIAGNOSTICS v_deleted_players = ROW_COUNT;

    DELETE FROM public.first_aider_volunteers
    WHERE id = ANY(v_first_aider_ids);
    GET DIAGNOSTICS v_deleted_first_aiders = ROW_COUNT;

    DELETE FROM public.match_fixtures
    WHERE id = ANY(v_fixture_ids);
    GET DIAGNOSTICS v_deleted_fixtures = ROW_COUNT;

    DELETE FROM public.seasons
    WHERE id = ANY(v_season_ids);
    GET DIAGNOSTICS v_deleted_seasons = ROW_COUNT;

    INSERT INTO public.system_admin_audit_log
        (source_system, severity, event_type, outcome, actor_type, details)
    VALUES (
        'club_check_in',
        'warning',
        'dummy_data_cleared',
        'success',
        'system_admin',
        jsonb_build_object(
            'players', v_deleted_players,
            'attendance_records', v_deleted_attendance,
            'attendance_history_recalculated', v_updated_history,
            'attendance_history_removed_for_dummy_seasons', v_deleted_history,
            'attendance_registers_removed_for_dummy_seasons', v_deleted_registers,
            'match_availability', v_deleted_availability,
            'match_submissions', v_deleted_submissions,
            'match_fixtures', v_deleted_fixtures,
            'season_planner_events', v_deleted_events,
            'season_planner_schedules', v_deleted_schedules,
            'season_planner_breaks', v_deleted_breaks,
            'seasons', v_deleted_seasons,
            'first_aider_volunteers', v_deleted_first_aiders,
            'coach_notifications', v_deleted_notifications
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'deleted', jsonb_build_object(
            'players', v_deleted_players,
            'attendance_records', v_deleted_attendance,
            'attendance_history_recalculated', v_updated_history,
            'attendance_history_removed_for_dummy_seasons', v_deleted_history,
            'attendance_registers_removed_for_dummy_seasons', v_deleted_registers,
            'match_availability', v_deleted_availability,
            'match_submissions', v_deleted_submissions,
            'match_fixtures', v_deleted_fixtures,
            'season_planner_events', v_deleted_events,
            'season_planner_schedules', v_deleted_schedules,
            'season_planner_breaks', v_deleted_breaks,
            'seasons', v_deleted_seasons,
            'first_aider_volunteers', v_deleted_first_aiders,
            'coach_notifications', v_deleted_notifications
        )
    );
END;
$function$;


DROP TRIGGER IF EXISTS preserve_dummy_age_group_display_name ON public.age_groups;
CREATE TRIGGER preserve_dummy_age_group_display_name BEFORE UPDATE OF display_name ON public.age_groups FOR EACH ROW EXECUTE FUNCTION preserve_dummy_identifier_prefix('display_name');

DROP TRIGGER IF EXISTS preserve_dummy_age_group_name ON public.age_groups;
CREATE TRIGGER preserve_dummy_age_group_name BEFORE UPDATE OF age_group ON public.age_groups FOR EACH ROW EXECUTE FUNCTION preserve_dummy_identifier_prefix('age_group');

DROP TRIGGER IF EXISTS preserve_dummy_approved_user_name ON public.approved_users;
CREATE TRIGGER preserve_dummy_approved_user_name BEFORE UPDATE OF name ON public.approved_users FOR EACH ROW EXECUTE FUNCTION preserve_dummy_identifier_prefix('name');

DROP TRIGGER IF EXISTS preserve_dummy_availability_child_name ON public.match_availability;
CREATE TRIGGER preserve_dummy_availability_child_name BEFORE UPDATE OF child_name ON public.match_availability FOR EACH ROW EXECUTE FUNCTION preserve_dummy_identifier_prefix('child_name');

DROP TRIGGER IF EXISTS preserve_dummy_break_label ON public.season_planner_breaks;
CREATE TRIGGER preserve_dummy_break_label BEFORE UPDATE OF label ON public.season_planner_breaks FOR EACH ROW EXECUTE FUNCTION preserve_dummy_identifier_prefix('label');

DROP TRIGGER IF EXISTS preserve_dummy_event_opposition ON public.season_planner_events;
CREATE TRIGGER preserve_dummy_event_opposition BEFORE UPDATE OF opposition ON public.season_planner_events FOR EACH ROW EXECUTE FUNCTION preserve_dummy_identifier_prefix('opposition');

DROP TRIGGER IF EXISTS preserve_dummy_event_title ON public.season_planner_events;
CREATE TRIGGER preserve_dummy_event_title BEFORE UPDATE OF title ON public.season_planner_events FOR EACH ROW EXECUTE FUNCTION preserve_dummy_identifier_prefix('title');

DROP TRIGGER IF EXISTS preserve_dummy_first_aider_name ON public.first_aider_volunteers;
CREATE TRIGGER preserve_dummy_first_aider_name BEFORE UPDATE OF name ON public.first_aider_volunteers FOR EACH ROW EXECUTE FUNCTION preserve_dummy_identifier_prefix('name', 'is_dummy');

DROP TRIGGER IF EXISTS preserve_dummy_fixture_opposition ON public.match_fixtures;
CREATE TRIGGER preserve_dummy_fixture_opposition BEFORE UPDATE OF opposition ON public.match_fixtures FOR EACH ROW EXECUTE FUNCTION preserve_dummy_identifier_prefix('opposition');

DROP TRIGGER IF EXISTS preserve_dummy_parent_access_name ON public.match_parent_access;
CREATE TRIGGER preserve_dummy_parent_access_name BEFORE UPDATE OF parent_name ON public.match_parent_access FOR EACH ROW EXECUTE FUNCTION preserve_dummy_identifier_prefix('parent_name');

DROP TRIGGER IF EXISTS preserve_dummy_pdm_requester_name ON public.personal_data_requests;
CREATE TRIGGER preserve_dummy_pdm_requester_name BEFORE UPDATE OF requester_name ON public.personal_data_requests FOR EACH ROW EXECUTE FUNCTION preserve_dummy_identifier_prefix('requester_name');

DROP TRIGGER IF EXISTS preserve_dummy_pdm_subject_name ON public.personal_data_requests;
CREATE TRIGGER preserve_dummy_pdm_subject_name BEFORE UPDATE OF subject_name ON public.personal_data_requests FOR EACH ROW EXECUTE FUNCTION preserve_dummy_identifier_prefix('subject_name');

DROP TRIGGER IF EXISTS preserve_dummy_players_name ON public.players;
CREATE TRIGGER preserve_dummy_players_name BEFORE UPDATE OF name ON public.players FOR EACH ROW EXECUTE FUNCTION preserve_dummy_identifier_prefix('name');

DROP TRIGGER IF EXISTS preserve_dummy_schedule_name ON public.season_planner_schedules;
CREATE TRIGGER preserve_dummy_schedule_name BEFORE UPDATE OF schedule_name ON public.season_planner_schedules FOR EACH ROW EXECUTE FUNCTION preserve_dummy_identifier_prefix('schedule_name');

DROP TRIGGER IF EXISTS preserve_dummy_season_name ON public.seasons;
CREATE TRIGGER preserve_dummy_season_name BEFORE UPDATE OF season_name ON public.seasons FOR EACH ROW EXECUTE FUNCTION preserve_dummy_identifier_prefix('season_name');

DROP TRIGGER IF EXISTS preserve_dummy_submission_parent_name ON public.match_submissions;
CREATE TRIGGER preserve_dummy_submission_parent_name BEFORE UPDATE OF parent_name ON public.match_submissions FOR EACH ROW EXECUTE FUNCTION preserve_dummy_identifier_prefix('parent_name');

REVOKE ALL ON FUNCTION public.preserve_dummy_identifier_prefix() FROM PUBLIC;

REVOKE ALL ON FUNCTION public.get_dummy_data_summary(text) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.clear_dummy_data(text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_dummy_data_summary(text) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.clear_dummy_data(text) TO anon, authenticated;
