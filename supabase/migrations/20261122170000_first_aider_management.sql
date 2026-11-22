-- First-Aider Management: System Admin-only volunteer cover register.
-- Volunteer names are adult personal data. Retention is manual review only until approved.

CREATE TABLE public.first_aider_volunteers (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
    active boolean NOT NULL DEFAULT true,
    is_dummy boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.first_aider_age_group_assignments (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    volunteer_id bigint NOT NULL REFERENCES public.first_aider_volunteers(id) ON DELETE CASCADE,
    age_group_id bigint NOT NULL REFERENCES public.age_groups(id),
    is_main boolean NOT NULL DEFAULT false,
    pitch text CHECK (pitch IS NULL OR length(btrim(pitch)) <= 80),
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT first_aider_age_group_assignments_volunteer_group_key UNIQUE (volunteer_id, age_group_id)
);

CREATE UNIQUE INDEX first_aider_one_main_group_per_volunteer
ON public.first_aider_age_group_assignments(volunteer_id)
WHERE is_main;

ALTER TABLE public.first_aider_volunteers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.first_aider_age_group_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.first_aider_volunteers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.first_aider_age_group_assignments FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_first_aider_admin_data(system_admin_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_groups jsonb;
    v_volunteers jsonb;
BEGIN
    IF NOT public._verify_system_admin_pin(system_admin_pin) THEN
        RETURN NULL;
    END IF;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id',g.id,'age_group',g.age_group,'display_name',g.display_name,
        'sort_order',g.sort_order,'active',g.active
    ) ORDER BY g.sort_order),'[]'::jsonb)
    INTO v_groups
    FROM public.age_groups g;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id',v.id,'name',v.name,'active',v.active,'is_dummy',v.is_dummy,
        'created_at',v.created_at,'updated_at',v.updated_at,
        'assignments',coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'age_group_id',a.age_group_id,'age_group',g.age_group,
                'display_name',g.display_name,'is_main',a.is_main,'pitch',a.pitch
            ) ORDER BY a.is_main DESC,g.sort_order)
            FROM public.first_aider_age_group_assignments a
            JOIN public.age_groups g ON g.id=a.age_group_id
            WHERE a.volunteer_id=v.id
        ),'[]'::jsonb)
    ) ORDER BY lower(v.name),v.id),'[]'::jsonb)
    INTO v_volunteers
    FROM public.first_aider_volunteers v;

    INSERT INTO public.system_admin_audit_log
        (source_system,severity,event_type,outcome,actor_type,details)
    VALUES
        ('club_check_in','info','first_aider_admin_opened','success','system_admin',
         jsonb_build_object('volunteer_count',jsonb_array_length(v_volunteers)));

    RETURN jsonb_build_object('age_groups',v_groups,'volunteers',v_volunteers);
END;
$function$;

CREATE OR REPLACE FUNCTION public.save_first_aider(
    system_admin_pin text,
    requested_id bigint,
    requested_name text,
    requested_main_age_group_id bigint,
    requested_main_pitch text,
    requested_additional_assignments jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_id bigint;
    v_must_change boolean;
    v_item record;
BEGIN
    IF NOT public._verify_system_admin_pin(system_admin_pin) THEN
        RETURN NULL;
    END IF;

    SELECT must_change_pin INTO v_must_change
    FROM public.system_admin_credentials WHERE singleton=true;
    IF coalesce(v_must_change,false) THEN
        RAISE EXCEPTION 'Change the temporary System Admin PIN before managing first-aider records';
    END IF;

    IF requested_name IS NULL OR length(btrim(requested_name)) NOT BETWEEN 1 AND 80 THEN
        RAISE EXCEPTION 'Enter a valid first-aider name';
    END IF;
    IF requested_main_pitch IS NOT NULL AND length(btrim(requested_main_pitch))>80 THEN
        RAISE EXCEPTION 'Pitch must be 80 characters or fewer';
    END IF;
    IF requested_additional_assignments IS NULL OR jsonb_typeof(requested_additional_assignments)<>'array'
       OR jsonb_array_length(requested_additional_assignments)>12 THEN
        RAISE EXCEPTION 'Invalid additional age-group assignments';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.age_groups
        WHERE id=requested_main_age_group_id AND active=true
    ) THEN
        RAISE EXCEPTION 'Select an active main age group';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM jsonb_to_recordset(requested_additional_assignments)
             AS x(age_group_id bigint,pitch text)
        LEFT JOIN public.age_groups g ON g.id=x.age_group_id AND g.active=true
        WHERE g.id IS NULL
           OR x.age_group_id=requested_main_age_group_id
           OR (x.pitch IS NOT NULL AND length(btrim(x.pitch))>80)
    ) THEN
        RAISE EXCEPTION 'One or more additional age-group assignments are invalid';
    END IF;

    IF (
        SELECT count(*) FROM jsonb_to_recordset(requested_additional_assignments)
             AS x(age_group_id bigint,pitch text)
    ) <> (
        SELECT count(DISTINCT x.age_group_id) FROM jsonb_to_recordset(requested_additional_assignments)
             AS x(age_group_id bigint,pitch text)
    ) THEN
        RAISE EXCEPTION 'An age group can only be assigned once to a volunteer';
    END IF;

    IF requested_id IS NULL THEN
        INSERT INTO public.first_aider_volunteers(name)
        VALUES (btrim(requested_name))
        RETURNING id INTO v_id;
    ELSE
        UPDATE public.first_aider_volunteers
        SET name=btrim(requested_name),updated_at=now()
        WHERE id=requested_id AND is_dummy=false
        RETURNING id INTO v_id;
        IF v_id IS NULL THEN
            RAISE EXCEPTION 'First-aider record not found or cannot be edited';
        END IF;
    END IF;

    DELETE FROM public.first_aider_age_group_assignments WHERE volunteer_id=v_id;

    INSERT INTO public.first_aider_age_group_assignments
        (volunteer_id,age_group_id,is_main,pitch)
    VALUES (v_id,requested_main_age_group_id,true,nullif(btrim(coalesce(requested_main_pitch,'')), ''));

    INSERT INTO public.first_aider_age_group_assignments
        (volunteer_id,age_group_id,is_main,pitch)
    SELECT v_id,x.age_group_id,false,nullif(btrim(coalesce(x.pitch,'')), '')
    FROM jsonb_to_recordset(requested_additional_assignments)
         AS x(age_group_id bigint,pitch text);

    INSERT INTO public.system_admin_audit_log
        (source_system,severity,event_type,outcome,actor_type,details)
    VALUES
        ('club_check_in','info',CASE WHEN requested_id IS NULL THEN 'first_aider_created' ELSE 'first_aider_updated' END,
         'success','system_admin',
         jsonb_build_object('volunteer_id',v_id,'main_age_group_id',requested_main_age_group_id,
                            'additional_count',jsonb_array_length(requested_additional_assignments)));

    RETURN jsonb_build_object('success',true,'id',v_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_first_aider_active(
    system_admin_pin text,
    requested_id bigint,
    requested_active boolean
)
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
    FROM public.system_admin_credentials WHERE singleton=true;
    IF coalesce(v_must_change,false) THEN
        RAISE EXCEPTION 'Change the temporary System Admin PIN before managing first-aider records';
    END IF;

    UPDATE public.first_aider_volunteers
    SET active=requested_active,updated_at=now()
    WHERE id=requested_id AND is_dummy=false
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
        RAISE EXCEPTION 'First-aider record not found or cannot be changed';
    END IF;

    INSERT INTO public.system_admin_audit_log
        (source_system,severity,event_type,outcome,actor_type,details)
    VALUES
        ('club_check_in','info','first_aider_status_changed','success','system_admin',
         jsonb_build_object('volunteer_id',v_id,'active',requested_active));

    RETURN jsonb_build_object('success',true,'id',v_id,'active',requested_active);
END;
$function$;

CREATE OR REPLACE FUNCTION public.clear_dummy_first_aider_data(system_admin_pin text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
DECLARE
    v_must_change boolean;
    v_deleted integer;
BEGIN
    IF NOT public._verify_system_admin_pin(system_admin_pin) THEN
        RETURN NULL;
    END IF;

    SELECT must_change_pin INTO v_must_change
    FROM public.system_admin_credentials WHERE singleton=true;
    IF coalesce(v_must_change,false) THEN
        RAISE EXCEPTION 'Change the temporary System Admin PIN before clearing sample data';
    END IF;

    DELETE FROM public.first_aider_volunteers WHERE is_dummy=true;
    GET DIAGNOSTICS v_deleted=ROW_COUNT;

    INSERT INTO public.system_admin_audit_log
        (source_system,severity,event_type,outcome,actor_type,details)
    VALUES
        ('club_check_in','warning','first_aider_dummy_data_cleared','success','system_admin',
         jsonb_build_object('deleted_dummy_volunteers',v_deleted));

    RETURN jsonb_build_object('success',true,'deleted',v_deleted);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_first_aider_admin_data(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.save_first_aider(text,bigint,text,bigint,text,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_first_aider_active(text,bigint,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clear_dummy_first_aider_data(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_first_aider_admin_data(text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.save_first_aider(text,bigint,text,bigint,text,jsonb) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.set_first_aider_active(text,bigint,boolean) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.clear_dummy_first_aider_data(text) TO anon,authenticated;

INSERT INTO public.retention_policies
    (policy_key,record_type,retention_value,retention_unit,action,enabled,enforcement_enabled,notes,policy_version,updated_at,updated_by)
VALUES
    ('first_aider_volunteers','First-aider volunteer names and age-group/pitch assignments',NULL,NULL,'review',true,false,
     'No retention period has been approved. Keep first-aider volunteer names and their age-group/pitch assignments under manual review. Do not automatically delete or anonymise these records until the Club documents and approves a retention period.',
     1,now(),'system_admin')
ON CONFLICT (policy_key) DO UPDATE SET
    record_type=excluded.record_type,retention_value=NULL,retention_unit=NULL,action='review',
    enabled=true,enforcement_enabled=false,notes=excluded.notes,
    policy_version=public.retention_policies.policy_version+1,updated_at=now(),updated_by='system_admin';

UPDATE public.club_policy_content c
SET content=jsonb_set(
    c.content,
    '{access_roles}',
    (
        SELECT jsonb_agg(
            CASE WHEN item.value->>'role'='System administrators'
                 THEN jsonb_set(item.value,'{description}',
                     to_jsonb(concat_ws(' ',item.value->>'description',
                         'This includes access to first-aider volunteer names and age-group/pitch allocations used to coordinate first-aid cover.')),
                     true)
                 ELSE item.value END
            ORDER BY item.ordinality
        )
        FROM jsonb_array_elements(c.content->'access_roles') WITH ORDINALITY AS item(value,ordinality)
    ),
    true
)
WHERE c.singleton=true AND jsonb_typeof(c.content->'access_roles')='array';

DO $seed$
DECLARE
    v_u6 bigint; v_u7 bigint; v_u8 bigint; v_u9 bigint; v_u10 bigint;
    v_a bigint; v_b bigint; v_c bigint;
BEGIN
    SELECT id INTO v_u6 FROM public.age_groups WHERE age_group='U6' AND active=true;
    SELECT id INTO v_u7 FROM public.age_groups WHERE age_group='U7' AND active=true;
    SELECT id INTO v_u8 FROM public.age_groups WHERE age_group='U8' AND active=true;
    SELECT id INTO v_u9 FROM public.age_groups WHERE age_group='U9' AND active=true;
    SELECT id INTO v_u10 FROM public.age_groups WHERE age_group='U10' AND active=true;

    IF v_u6 IS NULL OR v_u7 IS NULL OR v_u8 IS NULL OR v_u9 IS NULL OR v_u10 IS NULL THEN
        RAISE EXCEPTION 'Cannot create the agreed DUMMY example: active U6 to U10 age groups are required';
    END IF;

    INSERT INTO public.first_aider_volunteers(name,is_dummy)
    VALUES ('DUMMY - Parent A',true) RETURNING id INTO v_a;
    INSERT INTO public.first_aider_volunteers(name,is_dummy)
    VALUES ('DUMMY - Parent B',true) RETURNING id INTO v_b;
    INSERT INTO public.first_aider_volunteers(name,is_dummy)
    VALUES ('DUMMY - Parent C',true) RETURNING id INTO v_c;

    INSERT INTO public.first_aider_age_group_assignments(volunteer_id,age_group_id,is_main)
    VALUES
        (v_a,v_u8,true),(v_a,v_u6,false),(v_a,v_u7,false),
        (v_b,v_u9,true),(v_c,v_u10,true);
END;
$seed$;
