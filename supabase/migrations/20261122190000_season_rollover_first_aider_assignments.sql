-- Include first-aider coverage in the existing Admin season rollover review.
-- Main/shared designations are reviewed and committed atomically with player and coach rollover.

CREATE OR REPLACE FUNCTION public.get_season_rollover_preview_secure(
    supplied_code text,
    supplied_installation_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_actor_person_id text;
    v_result jsonb;
BEGIN
    IF public.verify_access_code(supplied_code, 'senior') IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Senior access verification failed';
    END IF;

    v_actor_person_id := public.get_authenticated_person_id(
        supplied_code, 'senior', supplied_installation_id
    );

    IF v_actor_person_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.approved_users u
        WHERE u.person_id = v_actor_person_id
          AND u.active = true
          AND EXISTS (
              SELECT 1
              FROM public.user_role_assignments r
              WHERE r.person_id = u.person_id
                AND r.role_key = 'admin'
          )
    ) THEN
        RAISE EXCEPTION 'Active Admin access is required';
    END IF;

    SELECT jsonb_build_object(
        'current_season', (
            SELECT s.season_name
            FROM public.seasons s
            WHERE s.is_current = true
            ORDER BY s.id DESC
            LIMIT 1
        ),
        'age_groups', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', ag.id,
                    'name', ag.age_group,
                    'display_name', ag.display_name,
                    'sort_order', ag.sort_order,
                    'active', ag.active,
                    'next_age_group_id', ag.next_age_group_id
                )
                ORDER BY ag.sort_order
            )
            FROM public.age_groups ag
        ), '[]'::jsonb),
        'coaches', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'person_id', u.person_id,
                    'name', u.name,
                    'current_age_group_ids', COALESCE((
                        SELECT jsonb_agg(a.age_group_id ORDER BY a.age_group_id)
                        FROM public.user_age_group_assignments a
                        WHERE a.person_id = u.person_id
                    ), '[]'::jsonb)
                )
                ORDER BY lower(u.name), u.person_id
            )
            FROM public.approved_users u
            JOIN public.user_role_assignments r
              ON r.person_id = u.person_id
             AND r.role_key = 'coach'
            WHERE u.active = true
              AND u.person_id <> 'MAIN-001'
        ), '[]'::jsonb),
        'first_aiders', COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'volunteer_id', v.id,
                    'name', v.name,
                    'is_dummy', v.is_dummy,
                    'assignments', COALESCE((
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'age_group_id', a.age_group_id,
                                'is_main', a.is_main
                            )
                            ORDER BY a.age_group_id
                        )
                        FROM public.first_aider_age_group_assignments a
                        WHERE a.volunteer_id = v.id
                    ), '[]'::jsonb)
                )
                ORDER BY lower(v.name), v.id
            )
            FROM public.first_aider_volunteers v
            WHERE v.active = true
        ), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_season_rollover_preview_secure(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_season_rollover_preview_secure(text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.rollover_season_with_coaches_secure(
    supplied_code text,
    supplied_installation_id text,
    expected_current_season text,
    new_season_name text,
    new_start_date date,
    coach_assignments jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_actor_person_id text;
    v_actor_name text;
    v_current_season text;
    v_expected jsonb;
    v_final jsonb;
    v_actual_expected jsonb;
    v_expected_first_aiders jsonb;
    v_final_first_aiders jsonb;
    v_actual_expected_first_aiders jsonb;
    v_coach record;
    v_first_aider record;
    v_old_ids bigint[];
    v_new_ids bigint[];
    v_old_json jsonb;
    v_new_json jsonb;
    v_old_first_aider_json jsonb;
    v_new_first_aider_json jsonb;
BEGIN
    IF public.verify_access_code(supplied_code, 'senior') IS DISTINCT FROM true THEN
        RAISE EXCEPTION 'Senior access verification failed';
    END IF;

    v_actor_person_id := public.get_authenticated_person_id(
        supplied_code, 'senior', supplied_installation_id
    );

    IF v_actor_person_id IS NULL THEN
        RAISE EXCEPTION 'Installation access could not be verified';
    END IF;

    SELECT u.name
      INTO v_actor_name
      FROM public.approved_users u
     WHERE u.person_id = v_actor_person_id
       AND u.active = true
       AND EXISTS (
           SELECT 1
           FROM public.user_role_assignments r
           WHERE r.person_id = u.person_id
             AND r.role_key = 'admin'
       );

    IF v_actor_name IS NULL THEN
        RAISE EXCEPTION 'Active Admin access is required';
    END IF;

    -- Official season rollover is locked until 1 August 2027 (UK club date).
    IF (now() AT TIME ZONE 'Europe/London')::date < date '2027-08-01' THEN
        RAISE EXCEPTION 'Official season rollover is not available until 1 August 2027';
    END IF;

    IF jsonb_typeof(coach_assignments) IS DISTINCT FROM 'object'
       OR jsonb_typeof(coach_assignments -> 'expected') IS DISTINCT FROM 'array'
       OR jsonb_typeof(coach_assignments -> 'final') IS DISTINCT FROM 'array'
       OR jsonb_typeof(coach_assignments -> 'first_aiders_expected') IS DISTINCT FROM 'array'
       OR jsonb_typeof(coach_assignments -> 'first_aiders_final') IS DISTINCT FROM 'array' THEN
        RAISE EXCEPTION 'Season rollover review data is invalid. Reload the review.';
    END IF;

    v_expected := coach_assignments -> 'expected';
    v_final := coach_assignments -> 'final';
    v_expected_first_aiders := coach_assignments -> 'first_aiders_expected';
    v_final_first_aiders := coach_assignments -> 'first_aiders_final';

    SELECT s.season_name
      INTO v_current_season
      FROM public.seasons s
     WHERE s.is_current = true
     ORDER BY s.id DESC
     LIMIT 1
     FOR UPDATE;

    IF v_current_season IS NULL
       OR v_current_season IS DISTINCT FROM expected_current_season THEN
        RAISE EXCEPTION 'The current season has changed. Reload the rollover review.';
    END IF;

    -- Lock existing coach and first-aider records against concurrent edits during review commit.
    PERFORM u.person_id
      FROM public.approved_users u
      JOIN public.user_role_assignments r
        ON r.person_id = u.person_id
       AND r.role_key = 'coach'
     WHERE u.active = true
       AND u.person_id <> 'MAIN-001'
     FOR UPDATE OF u;

    LOCK TABLE public.first_aider_volunteers IN SHARE ROW EXCLUSIVE MODE;
    LOCK TABLE public.first_aider_age_group_assignments IN SHARE ROW EXCLUSIVE MODE;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'person_id', u.person_id,
            'age_group_ids', COALESCE((
                SELECT jsonb_agg(a.age_group_id ORDER BY a.age_group_id)
                FROM public.user_age_group_assignments a
                WHERE a.person_id = u.person_id
            ), '[]'::jsonb)
        )
        ORDER BY u.person_id
    ), '[]'::jsonb)
      INTO v_actual_expected
      FROM public.approved_users u
      JOIN public.user_role_assignments r
        ON r.person_id = u.person_id
       AND r.role_key = 'coach'
     WHERE u.active = true
       AND u.person_id <> 'MAIN-001';

    IF v_expected IS DISTINCT FROM v_actual_expected THEN
        RAISE EXCEPTION 'Coach assignments have changed since the review was opened. Reload the review.';
    END IF;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'volunteer_id', v.id,
            'assignments', COALESCE((
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'age_group_id', a.age_group_id,
                        'is_main', a.is_main
                    )
                    ORDER BY a.age_group_id
                )
                FROM public.first_aider_age_group_assignments a
                WHERE a.volunteer_id = v.id
            ), '[]'::jsonb)
        )
        ORDER BY v.id
    ), '[]'::jsonb)
      INTO v_actual_expected_first_aiders
      FROM public.first_aider_volunteers v
     WHERE v.active = true;

    IF v_expected_first_aiders IS DISTINCT FROM v_actual_expected_first_aiders THEN
        RAISE EXCEPTION 'First-aider assignments have changed since the review was opened. Reload the review.';
    END IF;

    IF jsonb_array_length(v_final) <> jsonb_array_length(v_actual_expected) THEN
        RAISE EXCEPTION 'Every active coach must have one reviewed assignment set.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM (
            SELECT item ->> 'person_id' AS person_id, count(*) AS item_count
            FROM jsonb_array_elements(v_final) item
            GROUP BY item ->> 'person_id'
        ) x
        WHERE x.person_id IS NULL OR x.item_count <> 1
    ) THEN
        RAISE EXCEPTION 'Each coach must appear exactly once in the reviewed assignments.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_final) item
        LEFT JOIN public.approved_users u
          ON u.person_id = item ->> 'person_id'
         AND u.active = true
        WHERE u.person_id IS NULL
           OR NOT EXISTS (
               SELECT 1
               FROM public.user_role_assignments r
               WHERE r.person_id = u.person_id
                 AND r.role_key = 'coach'
           )
           OR jsonb_typeof(item -> 'age_group_ids') IS DISTINCT FROM 'array'
           OR jsonb_array_length(item -> 'age_group_ids') = 0
    ) THEN
        RAISE EXCEPTION 'Every active coach must retain at least one active age-group assignment.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_final) item
        CROSS JOIN LATERAL jsonb_array_elements_text(item -> 'age_group_ids') gid(value)
        LEFT JOIN public.age_groups ag
          ON ag.id = gid.value::bigint
         AND ag.active = true
        WHERE ag.id IS NULL
    ) THEN
        RAISE EXCEPTION 'A proposed coach age group is no longer active or does not exist.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_final) item
        CROSS JOIN LATERAL jsonb_array_elements_text(item -> 'age_group_ids') gid(value)
        GROUP BY item ->> 'person_id', gid.value
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'Duplicate coach age-group assignments were supplied.';
    END IF;

    IF jsonb_array_length(v_final_first_aiders) <> jsonb_array_length(v_actual_expected_first_aiders) THEN
        RAISE EXCEPTION 'Every active first aider must have one reviewed assignment set.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM (
            SELECT item ->> 'volunteer_id' AS volunteer_id, count(*) AS item_count
            FROM jsonb_array_elements(v_final_first_aiders) item
            GROUP BY item ->> 'volunteer_id'
        ) x
        WHERE x.volunteer_id IS NULL OR x.item_count <> 1
    ) THEN
        RAISE EXCEPTION 'Each active first aider must appear exactly once in the reviewed assignments.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_final_first_aiders) item
        LEFT JOIN public.first_aider_volunteers v
          ON v.id = (item ->> 'volunteer_id')::bigint
         AND v.active = true
        WHERE v.id IS NULL
           OR jsonb_typeof(item -> 'assignments') IS DISTINCT FROM 'array'
    ) THEN
        RAISE EXCEPTION 'A first-aider record is no longer active or its assignments are invalid.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_final_first_aiders) item
        WHERE (
            SELECT count(*)
            FROM jsonb_to_recordset(item -> 'assignments')
                 AS x(age_group_id bigint, is_main boolean, source_age_group_id bigint)
            WHERE x.is_main IS TRUE
        ) <> 1
        OR jsonb_array_length(item -> 'assignments') = 0
    ) THEN
        RAISE EXCEPTION 'Each active first aider must have exactly one main age-group assignment.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_final_first_aiders) item
        CROSS JOIN LATERAL jsonb_to_recordset(item -> 'assignments')
             AS x(age_group_id bigint, is_main boolean, source_age_group_id bigint)
        LEFT JOIN public.age_groups ag
          ON ag.id = x.age_group_id
         AND ag.active = true
        WHERE ag.id IS NULL
    ) THEN
        RAISE EXCEPTION 'A proposed first-aider age group is no longer active or does not exist.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(v_final_first_aiders) item
        CROSS JOIN LATERAL jsonb_to_recordset(item -> 'assignments')
             AS x(age_group_id bigint, is_main boolean, source_age_group_id bigint)
        GROUP BY item ->> 'volunteer_id', x.age_group_id
        HAVING count(*) > 1
    ) THEN
        RAISE EXCEPTION 'A first aider cannot be assigned to the same age group more than once.';
    END IF;

    -- All validations pass before any season or assignment data is changed.
    IF public.rollover_season(new_season_name, new_start_date) IS DISTINCT FROM true THEN
        RETURN false;
    END IF;

    -- Apply the reviewed final age-group set to each active coach.
    FOR v_coach IN
        SELECT item ->> 'person_id' AS person_id,
               item -> 'age_group_ids' AS age_group_ids
        FROM jsonb_array_elements(v_final) item
        ORDER BY item ->> 'person_id'
    LOOP
        SELECT COALESCE(array_agg(a.age_group_id ORDER BY a.age_group_id), ARRAY[]::bigint[])
          INTO v_old_ids
          FROM public.user_age_group_assignments a
         WHERE a.person_id = v_coach.person_id;

        SELECT COALESCE(array_agg(x.value::bigint ORDER BY x.value::bigint), ARRAY[]::bigint[])
          INTO v_new_ids
          FROM jsonb_array_elements_text(v_coach.age_group_ids) x(value);

        IF v_old_ids IS DISTINCT FROM v_new_ids THEN
            v_old_json := to_jsonb(v_old_ids);
            v_new_json := to_jsonb(v_new_ids);

            DELETE FROM public.user_age_group_assignments
             WHERE person_id = v_coach.person_id;

            INSERT INTO public.user_age_group_assignments(
                person_id, age_group_id, assigned_by
            )
            SELECT v_coach.person_id, x.value::bigint, v_actor_person_id
            FROM jsonb_array_elements_text(v_coach.age_group_ids) x(value);

            INSERT INTO public.user_access_audit_log(
                actor_person_id, target_person_id, action, old_values, new_values
            )
            VALUES (
                v_actor_person_id,
                v_coach.person_id,
                'season_coach_assignments_rolled_over',
                jsonb_build_object('season', v_current_season, 'age_group_ids', v_old_json),
                jsonb_build_object('season', new_season_name, 'age_group_ids', v_new_json)
            );
        END IF;
    END LOOP;

    -- Apply the reviewed main/shared first-aider assignments. Keep any legacy pitch
    -- value attached to its source assignment, without exposing it in the review UI.
    FOR v_first_aider IN
        SELECT (item ->> 'volunteer_id')::bigint AS volunteer_id,
               item -> 'assignments' AS assignments
        FROM jsonb_array_elements(v_final_first_aiders) item
        ORDER BY (item ->> 'volunteer_id')::bigint
    LOOP
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object('age_group_id', a.age_group_id, 'is_main', a.is_main)
            ORDER BY a.age_group_id
        ), '[]'::jsonb)
          INTO v_old_first_aider_json
          FROM public.first_aider_age_group_assignments a
         WHERE a.volunteer_id = v_first_aider.volunteer_id;

        SELECT COALESCE(jsonb_agg(
            jsonb_build_object('age_group_id', x.age_group_id, 'is_main', x.is_main)
            ORDER BY x.age_group_id
        ), '[]'::jsonb)
          INTO v_new_first_aider_json
          FROM jsonb_to_recordset(v_first_aider.assignments)
               AS x(age_group_id bigint, is_main boolean, source_age_group_id bigint);

        IF v_old_first_aider_json IS DISTINCT FROM v_new_first_aider_json THEN
            DELETE FROM public.first_aider_age_group_assignments
             WHERE volunteer_id = v_first_aider.volunteer_id;

            INSERT INTO public.first_aider_age_group_assignments(
                volunteer_id, age_group_id, is_main, pitch
            )
            SELECT
                v_first_aider.volunteer_id,
                x.age_group_id,
                x.is_main,
                (
                    SELECT old_assignment.pitch
                    FROM public.first_aider_age_group_assignments old_assignment
                    WHERE old_assignment.volunteer_id = v_first_aider.volunteer_id
                      AND old_assignment.age_group_id = x.source_age_group_id
                )
            FROM jsonb_to_recordset(v_first_aider.assignments)
                 AS x(age_group_id bigint, is_main boolean, source_age_group_id bigint);

            INSERT INTO public.system_admin_audit_log(
                source_system, severity, event_type, outcome, actor_type, actor_reference, details
            )
            VALUES (
                'club_check_in',
                'info',
                'season_first_aider_assignments_rolled_over',
                'success',
                'approved_user',
                v_actor_person_id,
                jsonb_build_object(
                    'volunteer_id', v_first_aider.volunteer_id,
                    'previous_season', v_current_season,
                    'new_season', new_season_name,
                    'old_assignments', v_old_first_aider_json,
                    'new_assignments', v_new_first_aider_json
                )
            );
        END IF;
    END LOOP;

    INSERT INTO public.system_admin_audit_log(
        source_system, severity, event_type, outcome, actor_type, actor_reference, details
    )
    VALUES (
        'club_check_in',
        'info',
        'season_rollover_with_coach_and_first_aider_assignments',
        'success',
        'approved_user',
        v_actor_person_id,
        jsonb_build_object(
            'actor_name', v_actor_name,
            'previous_season', v_current_season,
            'new_season', new_season_name,
            'coach_count', jsonb_array_length(v_final),
            'first_aider_count', jsonb_array_length(v_final_first_aiders)
        )
    );

    RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.rollover_season_with_coaches_secure(text,text,text,text,date,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rollover_season_with_coaches_secure(text,text,text,text,date,jsonb) TO anon, authenticated;

-- Update the published privacy notice: Admins can review first-aider details during rollover.
UPDATE public.club_policy_content c
SET content = jsonb_set(
    c.content,
    '{access_roles}',
    (
        SELECT jsonb_agg(
            CASE
                WHEN item.value ->> 'role' = 'Administrators' THEN
                    jsonb_set(
                        item.value,
                        '{description}',
                        to_jsonb(concat_ws(
                            ' ',
                            NULLIF(item.value ->> 'description', ''),
                            'Administrators can also review first-aider volunteer names and main/additional age-group allocations as part of the season rollover process.'
                        )),
                        true
                    )
                ELSE item.value
            END
            ORDER BY item.ordinality
        )
        FROM jsonb_array_elements(c.content -> 'access_roles')
             WITH ORDINALITY AS item(value, ordinality)
    ),
    true
)
WHERE c.singleton = true
  AND jsonb_typeof(c.content -> 'access_roles') = 'array';
