-- Spec 018, T2: iCloud (CalDAV) is a provider like Google (plan "Modelo de
-- datos", D3, D8; RF-5, RF-9 to RF-11).
--
-- Nothing else changes: the sync functions of specs 007 and 009 do not look at
-- the provider. For iCloud the Vault secret holds a JSON credential (Apple ID and
-- app-specific password) instead of a refresh token, and
-- synced_calendars.google_access keeps the calendar's access in iCloud too.

alter table public.calendar_connections
  drop constraint calendar_connections_provider_check,
  add constraint calendar_connections_provider_check
    check (provider in ('google', 'microsoft', 'icloud'));

alter table public.synced_calendars
  drop constraint synced_calendars_provider_check,
  add constraint synced_calendars_provider_check
    check (provider in ('google', 'microsoft', 'icloud'));

comment on column public.synced_calendars.google_access is
  'Access of the connected account to this calendar in its provider (Google or iCloud): owner, writer or reader (spec 009 D10, spec 018 D8).';
