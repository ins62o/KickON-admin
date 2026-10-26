create table if not exists public.football_sync_state (
  sync_key text primary key,
  last_attempted_at timestamptz not null default now(),
  last_succeeded_at timestamptz,
  last_error text
);

alter table public.football_sync_state enable row level security;

drop policy if exists "authenticated users read football sync state"
  on public.football_sync_state;
create policy "authenticated users read football sync state"
  on public.football_sync_state
  for select
  to authenticated
  using (true);

grant select on public.football_sync_state to authenticated;
