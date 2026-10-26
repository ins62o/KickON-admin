create or replace function public.create_lineup_notification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Reading an old fixture may lazily cache its lineup. That cache write must
  -- never be interpreted as a newly announced lineup.
  if new.status not in ('SCHEDULED', 'LIVE')
    or new.kickoff_at < now() - interval '3 hours' then
    return new;
  end if;

  if new.lineup_announced_at is not null
    and (
      tg_op = 'INSERT'
      or old.lineup_announced_at is null
      or old.lineup_announced_at is distinct from new.lineup_announced_at
    ) then
    insert into public.notifications (
      user_id, type, title, body, data, dedupe_key
    )
    select
      profile.id,
      'LINEUP',
      '응원팀의 선발 라인업이 공개됐어요',
      '오늘 경기의 선발 명단을 확인해보세요.',
      jsonb_build_object('tab', 'Fixtures', 'fixtureId', new.id),
      'fixture-lineup:' || new.id
    from public.profiles profile
    join public.notification_preferences preference
      on preference.user_id = profile.id
    where profile.team_id in (new.home_team_id, new.away_team_id)
      and preference.lineup_notifications_enabled
    on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.create_lineup_notification()
from public, anon, authenticated;
