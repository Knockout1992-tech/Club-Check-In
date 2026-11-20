CREATE OR REPLACE FUNCTION public.anonymise_archived_player(
    supplied_code text,
    requested_player_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    highest_number integer;
    new_name text;
BEGIN
    IF public.verify_access_code(supplied_code, 'senior') IS DISTINCT FROM true THEN
        RETURN NULL;
    END IF;

    IF requested_player_id IS NULL OR trim(requested_player_id) = '' THEN
        RETURN NULL;
    END IF;

    PERFORM 1
    FROM public.players AS p
    WHERE p.player_id = requested_player_id
      AND p.archived = true
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.retention_holds AS h
        WHERE h.status = 'active'
          AND h.target_table = 'players'
          AND h.target_reference = requested_player_id
    ) THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(
        MAX(substring(p.name FROM '^Anonymous-([0-9]+)$')::integer),
        0
    )
    INTO highest_number
    FROM public.players AS p
    WHERE p.name ~ '^Anonymous-[0-9]+$';

    new_name := 'Anonymous-' || lpad((highest_number + 1)::text, 3, '0');

    UPDATE public.match_availability AS ma
    SET child_name = 'Archived player',
        updated_at = now()
    WHERE ma.player_id = requested_player_id
      AND ma.child_name IS DISTINCT FROM 'Archived player'
      AND NOT EXISTS (
          SELECT 1
          FROM public.retention_holds AS h
          WHERE h.status = 'active'
            AND h.target_table = 'match_availability'
            AND h.target_reference = ma.id::text
      );

    UPDATE public.players
    SET name = new_name,
        gms = false,
        coach_gms_suggestion = false,
        active = false,
        archived = true,
        last_attendance_date = NULL
    WHERE player_id = requested_player_id
      AND archived = true;

    RETURN new_name;
END;
$function$;