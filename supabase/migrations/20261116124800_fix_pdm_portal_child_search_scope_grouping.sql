CREATE OR REPLACE FUNCTION public.search_personal_data_subjects(p_system_admin_pin text, p_search_term text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_term text:=lower(btrim(coalesce(p_search_term,'')));v_parents jsonb;v_children jsonb;
begin
 if not public._verify_system_admin_pin(p_system_admin_pin) then return null; end if;
 if length(v_term)<2 or length(v_term)>100 then return jsonb_build_object('success',false,'message','Enter at least two characters.'); end if;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.parent_name),'[]'::jsonb) into v_parents
 from (select pa.id::text as subject_reference,pa.parent_name,pa.created_at,pa.last_activity_at,pa.disabled_at,
  (select count(*) from public.match_parent_family_members fm where fm.parent_access_id=pa.id) as family_memberships,
  (select count(*) from public.match_submissions ms where ms.last_updated_by_parent_id=pa.id) as linked_submissions
  from public.match_parent_access pa where lower(pa.parent_name) like '%'||v_term||'%' order by pa.parent_name limit 30) x;
 select coalesce(jsonb_agg(to_jsonb(x) order by x.subject_name,x.age_group),'[]'::jsonb) into v_children
 from (
  select 'player:'||p.player_id as subject_reference,'child'::text as subject_type,p.name as subject_name,
   p.age_group,null::text as school_year,p.active,p.archived,
   (select count(*) from public.attendance_records ar where ar.player_id=p.player_id) as attendance_records,
   (select count(*) from public.match_availability ma where ma.player_id=p.player_id) as availability_records,
   null::bigint as age_group_id,null::bigint as family_id,null::text as parent_name,null::bigint as parent_access_id,null::bigint as source_submission_id,
   'Club Check-In player'::text as context_label,null::jsonb as availability_ids,false as ambiguous_match
  from public.players p where lower(p.name) like '%'||v_term||'%'
  union all
  select 'portal:'||encode(convert_to(ma.child_name||'|'||ma.age_group_id::text||'|'||coalesce(ma.school_year,'')||'|'||coalesce(ms.family_id::text,'')||'|'||coalesce(ms.parent_name,'')||'|'||coalesce(ms.last_updated_by_parent_id::text,'legacy:'||ms.id::text),'UTF8'),'base64'),
   'portal_child'::text,ma.child_name,ag.display_name,ma.school_year,null::boolean,null::boolean,0::bigint,count(*)::bigint,
   ma.age_group_id,ms.family_id,ms.parent_name,ms.last_updated_by_parent_id as parent_access_id,
   case when ms.last_updated_by_parent_id is null then ms.id else null end as source_submission_id,
   case when ms.family_id is not null then 'Parent Portal · shared family response' else 'Parent Portal · '||coalesce(ms.parent_name,'parent not recorded') end,
   jsonb_agg(ma.id order by ma.id),
   bool_or((select count(*) from public.match_availability dup
     where dup.submission_id=ma.submission_id and dup.player_id is null
       and lower(dup.child_name)=lower(ma.child_name) and dup.age_group_id=ma.age_group_id
       and coalesce(dup.school_year,'')=coalesce(ma.school_year,''))>1)
  from public.match_availability ma join public.match_submissions ms on ms.id=ma.submission_id
   join public.age_groups ag on ag.id=ma.age_group_id
  where ma.player_id is null and lower(ma.child_name) like '%'||v_term||'%'
  group by ma.child_name,ma.age_group_id,ag.display_name,ma.school_year,ms.family_id,ms.parent_name,ms.last_updated_by_parent_id,case when ms.last_updated_by_parent_id is null then ms.id else null end,coalesce(ms.last_updated_by_parent_id::text,'legacy:'||ms.id::text)
  order by subject_name,age_group limit 50
 ) x;
 insert into public.system_admin_audit_log(source_system,severity,event_type,outcome,actor_type,details)
 values('club_check_in','info','personal_data_subject_search','success','system_admin',
  jsonb_build_object('search_length',length(v_term),'parent_results',jsonb_array_length(v_parents),'child_results',jsonb_array_length(v_children)));
 return jsonb_build_object('success',true,'parents',v_parents,'children',v_children);
end;$function$;