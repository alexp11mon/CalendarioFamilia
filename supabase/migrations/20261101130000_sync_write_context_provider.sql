-- Spec 018, T3: sync_write_context also says which provider writes (plan D1),
-- because an Editor cannot read calendar_connections. Same checks as spec 009;
-- only the returned object gains `provider`.

create or replace function public.sync_write_context(
  p_secret text,
  p_calendar_id uuid,
  p_event_id uuid default null,
  p_target_calendar_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_target uuid := coalesce(p_target_calendar_id, p_calendar_id);
  v_event_external text;
  v_source public.synced_calendars;
  v_dest public.synced_calendars;
begin
  perform public.sync_check_secret(p_secret);

  if (select auth.uid()) is null
    or public.calendar_role_for(p_calendar_id) is distinct from 'owner'
      and public.calendar_role_for(p_calendar_id) is distinct from 'editor'
    or public.calendar_role_for(v_target) is distinct from 'owner'
      and public.calendar_role_for(v_target) is distinct from 'editor' then
    raise exception 'Only the owner or an editor writes events' using errcode = '42501';
  end if;

  if p_event_id is not null then
    select external_id into v_event_external
    from public.events
    where id = p_event_id and calendar_id = p_calendar_id;
    if not found then
      raise exception 'Invalid event' using errcode = 'CF404';
    end if;
  end if;

  select * into v_source from public.synced_calendars where calendar_id = p_calendar_id;
  select * into v_dest from public.synced_calendars where calendar_id = v_target;

  if v_source.calendar_id is null and v_dest.calendar_id is null then
    return jsonb_build_object('synced', false);
  end if;

  -- Never between a synced calendar and a normal one, or two accounts (RF-20; spec 018 RF-42).
  if v_source.calendar_id is null or v_dest.calendar_id is null
    or v_source.connection_id <> v_dest.connection_id then
    raise exception 'Events only move inside one connected account' using errcode = '22023';
  end if;

  if not public.can_write_synced(p_calendar_id) or not public.can_write_synced(v_target) then
    raise exception 'The account cannot write in this calendar' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'synced', true,
    'provider', v_source.provider,
    'connection_id', v_source.connection_id,
    'calendar_external_id', v_source.external_id,
    'target_external_id', v_dest.external_id,
    'event_external_id', v_event_external
  );
end;
$$;
