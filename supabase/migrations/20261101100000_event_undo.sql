-- Spec 017, T1: "Deshacer" after deleting an event (plan "Modelo de datos",
-- D6, D7; RF-25, RF-28 to RF-30).
--
-- snapshot_event keeps a copy of an event, its ready images and its comments
-- right before the usual delete path runs (Google first, delete_occurrences,
-- RLS). restore_event puts them back for whoever deleted, within a minute:
-- clients cannot insert images, comments or another author's event (RLS), so
-- a definer function does it after checking the role again.

create table public.event_trash (
  id uuid primary key default gen_random_uuid(),
  deleted_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  calendar_id uuid not null references public.calendars (id) on delete cascade,
  -- The row as it was; null for an occurrence of a series without a row.
  event jsonb,
  -- An occurrence: undoing takes its date out of the series' exdates.
  series_id uuid,
  original_start timestamptz,
  images jsonb not null default '[]',
  comments jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create index event_trash_deleted_by_idx on public.event_trash (deleted_by);
create index event_trash_calendar_id_idx on public.event_trash (calendar_id);

-- Only the functions below use it (P3).
alter table public.event_trash enable row level security;
revoke all on public.event_trash from anon, authenticated;

create function public.snapshot_event(
  p_event_id uuid,
  p_original_start timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.events;
  v_calendar uuid;
  v_id uuid;
begin
  if p_original_start is null then
    select * into v_event from public.events where id = p_event_id;
    v_calendar := v_event.calendar_id;
  else
    -- p_event_id is the series; its exception of that date, if any.
    select calendar_id into v_calendar
    from public.events
    where id = p_event_id and recurrence is not null;
    select * into v_event
    from public.events
    where series_id = p_event_id and original_start = p_original_start;
  end if;

  if v_calendar is null
    or coalesce(public.calendar_role_for(v_calendar)::text, '') not in ('owner', 'editor')
  then
    raise exception 'Event not found' using errcode = 'CF404';
  end if;

  -- Only the last action can be undone (RF-30).
  delete from public.event_trash where deleted_by = auth.uid();

  insert into public.event_trash (calendar_id, event, series_id, original_start, images, comments)
  values (
    v_calendar,
    case when v_event.id is null then null else to_jsonb(v_event) end,
    case when p_original_start is null then null else p_event_id end,
    p_original_start,
    coalesce((
      select jsonb_agg(to_jsonb(i) order by i.created_at)
      from public.event_images i
      where i.event_id = v_event.id and i.status = 'ready'
    ), '[]'),
    coalesce((
      select jsonb_agg(to_jsonb(c) order by c.created_at)
      from public.event_comments c
      where c.event_id = v_event.id
    ), '[]')
  )
  returning id into v_id;
  return v_id;
end;
$$;

create function public.restore_event(
  p_trash_id uuid,
  p_event_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_trash public.event_trash;
  v_event public.events;
  v_id uuid;
begin
  select * into v_trash
  from public.event_trash
  where id = p_trash_id
    and deleted_by = auth.uid()
    -- "Deshacer" lasts 10 s; a minute leaves room for slow requests (RF-26).
    and created_at > now() - interval '1 minute';
  if v_trash.id is null
    or coalesce(public.calendar_role_for(v_trash.calendar_id)::text, '') not in ('owner', 'editor')
  then
    raise exception 'Nothing to restore' using errcode = 'CF404';
  end if;

  if v_trash.event is not null then
    v_event := jsonb_populate_record(null::public.events, v_trash.event);
    if p_event_id is null then
      -- A synced calendar gets the event back through Google first (RF-3).
      if public.is_synced_calendar(v_trash.calendar_id) then
        raise exception 'Synced calendar' using errcode = '22023';
      end if;
      insert into public.events select v_event.*;
      v_id := v_event.id;
    else
      -- Created again in Google and committed by sync_commit_event: keep its
      -- author (RF-28).
      update public.events set created_by = v_event.created_by where id = p_event_id;
      v_id := p_event_id;
    end if;

    insert into public.event_images
    select (jsonb_populate_record(null::public.event_images, i || jsonb_build_object('event_id', v_id))).*
    from jsonb_array_elements(v_trash.images) i;

    -- The deleted rows queued their objects; they are used again (plan D7).
    delete from public.image_purge_queue q
    where q.object_id in (
      select (i ->> 'object_id')::uuid from jsonb_array_elements(v_trash.images) i
    );

    insert into public.event_comments
    select (jsonb_populate_record(null::public.event_comments, c || jsonb_build_object('event_id', v_id))).*
    from jsonb_array_elements(v_trash.comments) c;
  end if;

  -- An occurrence: deleting it added its date to the series' exdates.
  if v_trash.series_id is not null or v_event.series_id is not null then
    update public.events
    set exdates = array_remove(exdates, coalesce(v_trash.original_start, v_event.original_start))
    where id = coalesce(v_trash.series_id, v_event.series_id);
    if not found then
      raise exception 'Series not found' using errcode = 'CF404';
    end if;
    v_id := coalesce(v_id, v_trash.series_id);
  end if;

  delete from public.event_trash where id = v_trash.id;
  return v_id;
end;
$$;

revoke execute on function
  public.snapshot_event(uuid, timestamptz),
  public.restore_event(uuid, uuid)
from public, anon;
grant execute on function
  public.snapshot_event(uuid, timestamptz),
  public.restore_event(uuid, uuid)
to authenticated;

-- The hourly purge leaves objects queued in the last 2 minutes, so a deleted
-- event's images survive its "Deshacer" (plan D7). Removing one image passes
-- its ids and is still immediate (spec 012).
create or replace function public.images_claim_purge(
  p_secret text,
  p_limit integer default 100,
  p_object_ids uuid[] default null,
  p_orphan_age interval default interval '1 hour'
)
returns setof uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.sync_check_secret(p_secret);

  delete from public.event_images
  where status = 'pending'
    and created_at < now() - interval '1 hour';

  insert into public.image_purge_queue (object_id, bytes)
  select public.image_object_id(o.name), sum(coalesce((o.metadata ->> 'size')::bigint, 1))::int
  from storage.objects o
  where o.bucket_id = 'event-images'
    and o.created_at < now() - p_orphan_age
    and public.image_object_id(o.name) is not null
    and not exists (
      select 1 from public.event_images i
      where i.object_id = public.image_object_id(o.name)
    )
  group by public.image_object_id(o.name)
  on conflict (object_id) do nothing;

  return query
  update public.image_purge_queue q
  set claimed_at = now(), attempts = q.attempts + 1
  where q.object_id in (
    select c.object_id
    from public.image_purge_queue c
    where c.attempts < 5
      and (c.claimed_at is null or c.claimed_at < now() - interval '5 minutes')
      and (
        (p_object_ids is null and c.queued_at < now() - interval '2 minutes')
        or c.object_id = any (p_object_ids)
      )
    order by c.queued_at
    limit greatest(p_limit, 0)
    for update skip locked
  )
  returning q.object_id;
end;
$$;

-- Snapshots older than an hour are useless (restore_event refuses them).
create function public.trash_purge()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.event_trash where created_at < now() - interval '1 hour';
$$;

revoke execute on function public.trash_purge() from public, anon, authenticated;

select cron.schedule('event-trash-purge', '0 5 * * *', $$select public.trash_purge()$$);

-- Test helper, like images_scheduled_jobs.
create function public.trash_scheduled_jobs()
returns table (jobname text, schedule text)
language sql
security definer
set search_path = ''
as $$
  select j.jobname::text, j.schedule::text from cron.job j where j.jobname = 'event-trash-purge';
$$;

revoke execute on function public.trash_scheduled_jobs() from public, anon, authenticated;
grant execute on function public.trash_scheduled_jobs() to service_role;
