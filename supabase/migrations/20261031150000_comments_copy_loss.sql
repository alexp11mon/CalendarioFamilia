-- Spec 014, T2: copies of ownerless calendars copy the comments (plan D10,
-- RF-27) and series_loss counts the comments of the exceptions a change would
-- remove, for the warning of spec 013 (plan D6, RF-28).

-- copy_calendar_for_owner (last in series_copy_upload) also copies comments.
create or replace function public.copy_calendar_for_owner(p_calendar_id uuid, p_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_copy uuid;
begin
  insert into public.calendars (owner_id, name, description, color)
  select p_user_id, c.name, c.description, c.color
  from public.calendars c
  where c.id = p_calendar_id
  returning id into v_copy;

  if v_copy is null then
    raise exception 'Calendar not found' using errcode = 'P0002';
  end if;

  insert into public.event_categories (calendar_id, name)
  select v_copy, ec.name
  from public.event_categories ec
  where ec.calendar_id = p_calendar_id;

  -- apply_orphan_decisions copies several times in one transaction.
  drop table if exists pg_temp.copied_events;
  create temporary table pg_temp.copied_events on commit drop as
  select e.id as source_id, gen_random_uuid() as copy_id
  from public.events e
  where e.calendar_id = p_calendar_id;

  -- Series before their exceptions: the trigger of each exception looks for
  -- its series among the rows already inserted.
  insert into public.events (
    id, calendar_id, title, description, location, starts_at, ends_at,
    all_day, color, category_id, created_by,
    recurrence, recurrence_tz, recurrence_until, exdates, series_id, original_start
  )
  select
    m.copy_id, v_copy, e.title, e.description, e.location, e.starts_at, e.ends_at,
    e.all_day, e.color, nc.id, e.created_by,
    e.recurrence, e.recurrence_tz, e.recurrence_until, e.exdates, ms.copy_id, e.original_start
  from pg_temp.copied_events m
  join public.events e on e.id = m.source_id
  left join pg_temp.copied_events ms on ms.source_id = e.series_id
  left join public.event_categories oc on oc.id = e.category_id
  left join public.event_categories nc
    on nc.calendar_id = v_copy
    and lower(btrim(nc.name)) = lower(btrim(oc.name))
  order by e.series_id nulls first;

  insert into public.event_images (
    event_id, object_id, uploaded_by, status, bytes, width, height, created_at
  )
  select m.copy_id, i.object_id, i.uploaded_by, 'ready', i.bytes, i.width, i.height, i.created_at
  from pg_temp.copied_events m
  join public.event_images i on i.event_id = m.source_id
  where i.status = 'ready';

  -- Comments keep their author, dates and edit mark (RF-27).
  insert into public.event_comments (
    event_id, author_id, client_id, body, created_at, edited_at
  )
  select m.copy_id, c.author_id, gen_random_uuid(), c.body, c.created_at, c.edited_at
  from pg_temp.copied_events m
  join public.event_comments c on c.event_id = m.source_id;

  return v_copy;
end;
$$;

-- series_loss (event_series_functions) gains the comments column; the return
-- type changes, so it is dropped and created again.
drop function public.series_loss(uuid, timestamptz, timestamptz);

create function public.series_loss(
  p_series_id uuid,
  p_from timestamptz default null,
  p_only timestamptz default null
)
returns table (exceptions int, images int, comments int)
language sql
stable
set search_path = ''
as $$
  with lost as (
    select e.id
    from public.events e
    where e.series_id = p_series_id
      and (p_from is null or e.original_start >= p_from)
      and (p_only is null or e.original_start = p_only)
  )
  select
    (select count(*) from lost)::int,
    (select count(*) from public.event_images i
     where i.event_id in (select id from lost) and i.status = 'ready')::int,
    (select count(*) from public.event_comments c
     where c.event_id in (select id from lost))::int;
$$;

revoke execute on function public.series_loss(uuid, timestamptz, timestamptz) from public, anon;
grant execute on function public.series_loss(uuid, timestamptz, timestamptz) to authenticated;
