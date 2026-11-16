create or replace function public.get_personal_data_request_history(
  p_system_admin_pin text,
  p_request_ref text,
  p_requested_limit integer default 100
)
returns table (
  id bigint,
  occurred_at timestamptz,
  event_type text,
  outcome text,
  actor_type text
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  safe_limit integer;
begin
  if not public._verify_system_admin_pin(p_system_admin_pin) then
    return;
  end if;

  if nullif(btrim(p_request_ref), '') is null then
    return;
  end if;

  safe_limit := least(greatest(coalesce(p_requested_limit, 100), 1), 200);

  return query
  select l.id, l.occurred_at, l.event_type, l.outcome, l.actor_type
  from public.system_admin_audit_log as l
  where l.request_id = p_request_ref
  order by l.occurred_at desc, l.id desc
  limit safe_limit;
end;
$function$;

revoke all on function public.get_personal_data_request_history(text, text, integer) from public;
grant execute on function public.get_personal_data_request_history(text, text, integer) to anon, authenticated;
