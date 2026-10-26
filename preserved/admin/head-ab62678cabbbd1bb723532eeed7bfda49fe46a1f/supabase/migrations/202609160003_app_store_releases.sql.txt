-- Public release metadata only. No client may change release versions.
create table public.app_store_releases (
  platform text primary key check (platform in ('ios', 'android')),
  version text not null check (version ~ '^[0-9]+(\.[0-9]+){0,3}$'),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.app_store_releases enable row level security;
revoke all on public.app_store_releases from anon, authenticated;
grant select on public.app_store_releases to anon, authenticated;
create policy "Anyone can read available app releases"
  on public.app_store_releases for select to anon, authenticated using (enabled);
