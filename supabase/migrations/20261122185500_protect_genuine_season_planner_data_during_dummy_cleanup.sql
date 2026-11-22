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
       OR player_id = ANY(v_player_ids)
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

    -- Never remove a non-DUMMY child response merely because its linked player is labelled DUMMY.
    IF EXISTS (
        SELECT 1
        FROM public.match_availability a
        JOIN public.players p ON p.player_id = a.player_id
        WHERE btrim(p.name) ILIKE 'DUMMY%'
          AND btrim(a.child_name) NOT ILIKE 'DUMMY%'
    ) THEN
        RAISE EXCEPTION 'DUMMY cleanup paused: a DUMMY player is linked to a non-DUMMY availability record. No records were changed.';
    END IF;

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

    -- Do not cascade-delete genuine planner schedules, breaks or events through a DUMMY season.
    IF EXISTS (
        SELECT 1 FROM public.season_planner_schedules s
        WHERE s.season_id = ANY(v_season_ids)
          AND btrim(s.schedule_name) NOT ILIKE 'DUMMY%'
    ) OR EXISTS (
        SELECT 1 FROM public.season_planner_breaks b
        WHERE b.season_id = ANY(v_season_ids)
          AND btrim(b.label) NOT ILIKE 'DUMMY%'
    ) OR EXISTS (
        SELECT 1 FROM public.season_planner_events e
        WHERE (
            e.season_id = ANY(v_season_ids)
            OR e.schedule_id = ANY(v_schedule_ids)
            OR e.holiday_break_id = ANY(v_break_ids)
        )
          AND btrim(coalesce(e.title, '')) NOT ILIKE 'DUMMY%'
          AND btrim(coalesce(e.opposition, '')) NOT ILIKE 'DUMMY%'
    ) THEN
        RAISE EXCEPTION 'DUMMY cleanup paused: a DUMMY season, schedule or break contains non-DUMMY planner records. No records were changed.';
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
$function$
;
