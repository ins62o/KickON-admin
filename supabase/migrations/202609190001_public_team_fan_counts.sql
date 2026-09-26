begin;

create or replace function public.public_team_fan_counts()
returns table (
  team_id text,
  fan_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    team.id as team_id,
    count(profile.id)::bigint as fan_count
  from public.teams team
  left join public.profiles profile
    on profile.team_id = team.id
    and profile.registration_completed_at is not null
  group by team.id
  order by team.id;
$$;

revoke all on function public.public_team_fan_counts()
  from public, anon, authenticated;
grant execute on function public.public_team_fan_counts()
  to anon, authenticated;

comment on function public.public_team_fan_counts() is
  'Returns completed KickON member counts grouped by supporter team without exposing profile rows.';

commit;
