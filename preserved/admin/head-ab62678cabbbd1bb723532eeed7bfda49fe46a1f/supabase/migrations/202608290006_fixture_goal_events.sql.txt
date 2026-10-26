alter table public.fixtures
  add column if not exists goal_events jsonb not null default '[]'::jsonb;

alter table public.fixtures
  drop constraint if exists fixtures_goal_events_array_check;
alter table public.fixtures
  add constraint fixtures_goal_events_array_check
  check (jsonb_typeof(goal_events) = 'array');

comment on column public.fixtures.goal_events is
  'Normalized Sportmonks goal events, including scorer, assist, minute, event order and score after the goal.';
