alter table public.fixtures
  add column if not exists pending_goal_events jsonb,
  add column if not exists pending_goal_events_since timestamptz;

alter table public.fixtures
  drop constraint if exists fixtures_pending_goal_events_array_check;
alter table public.fixtures
  add constraint fixtures_pending_goal_events_array_check
  check (
    pending_goal_events is null
    or jsonb_typeof(pending_goal_events) = 'array'
  );

comment on column public.fixtures.pending_goal_events is
  'Provider goal snapshot awaiting stability confirmation before replacing goal_events.';
comment on column public.fixtures.pending_goal_events_since is
  'When the pending goal snapshot first agreed with the provider score.';
