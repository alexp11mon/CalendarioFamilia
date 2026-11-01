-- Spec 017, T4: undoing the deletion of an event of Google creates it again
-- there first (spec RF-3, case "Deshacer un borrado en un calendario traído"),
-- so the action needs the saved row. Only whoever deleted reads it, within
-- the same minute as restore_event; the clients still cannot read the table.
create function public.trash_row(p_trash_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select t.event
  from public.event_trash t
  where t.id = p_trash_id
    and t.deleted_by = auth.uid()
    and t.created_at > now() - interval '1 minute';
$$;

revoke execute on function public.trash_row(uuid) from public, anon;
grant execute on function public.trash_row(uuid) to authenticated;
