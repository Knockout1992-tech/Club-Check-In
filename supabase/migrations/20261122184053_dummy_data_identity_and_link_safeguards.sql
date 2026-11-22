CREATE OR REPLACE FUNCTION public.prevent_dummy_player_delete_if_real_availability()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.match_availability a
        WHERE a.player_id = OLD.player_id
          AND btrim(a.child_name) NOT ILIKE 'DUMMY%'
    ) THEN
        RAISE EXCEPTION 'DUMMY cleanup paused: this player is linked to a non-DUMMY match availability record';
    END IF;
    RETURN OLD;
END;
$function$


DROP TRIGGER IF EXISTS preserve_dummy_age_group_code ON public.age_groups;
CREATE TRIGGER preserve_dummy_age_group_code BEFORE UPDATE OF age_group ON public.age_groups FOR EACH ROW EXECUTE FUNCTION preserve_dummy_identifier_prefix('age_group');

DROP TRIGGER IF EXISTS preserve_dummy_notification_title ON public.coach_notification_outbox;
CREATE TRIGGER preserve_dummy_notification_title BEFORE UPDATE OF event_title ON public.coach_notification_outbox FOR EACH ROW EXECUTE FUNCTION preserve_dummy_identifier_prefix('event_title');

DROP TRIGGER IF EXISTS prevent_dummy_player_delete_if_real_availability ON public.players;
CREATE TRIGGER prevent_dummy_player_delete_if_real_availability BEFORE DELETE ON public.players FOR EACH ROW WHEN ((old.name ~~* 'DUMMY%'::text)) EXECUTE FUNCTION prevent_dummy_player_delete_if_real_availability();

REVOKE ALL ON FUNCTION public.prevent_dummy_player_delete_if_real_availability() FROM PUBLIC;
