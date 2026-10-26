-- Use the requested concise signup notification description.
create or replace function public.notify_discord_on_registration_completed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  supporter_team_name text;
begin
  select team.name into supporter_team_name
  from public.teams team
  where team.id = new.team_id;

  perform public.enqueue_discord_admin_notification(
    jsonb_build_object(
      'username', 'KickON 운영 알림',
      'allowed_mentions', jsonb_build_object('parse', jsonb_build_array()),
      'embeds', jsonb_build_array(
        jsonb_build_object(
          'title', '신규 가입자가 있습니다',
          'description', '새 사용자가 KickON에 가입했습니다.',
          'color', 3447003,
          'fields', jsonb_build_array(
            jsonb_build_object(
              'name', '사용자 ID',
              'value', '`' || new.id::text || '`',
              'inline', false
            ),
            jsonb_build_object(
              'name', '닉네임',
              'value', left(new.nickname, 100),
              'inline', true
            ),
            jsonb_build_object(
              'name', '응원 팀',
              'value', left(coalesce(supporter_team_name, new.team_id), 100),
              'inline', true
            ),
            jsonb_build_object(
              'name', '가입 시각',
              'value', to_char(
                new.registration_completed_at at time zone 'Asia/Seoul',
                'YYYY-MM-DD HH24:MI'
              ) || ' KST',
              'inline', true
            )
          ),
          'timestamp', new.registration_completed_at
        )
      )
    )
  );
  return new;
exception
  when others then
    raise warning 'KickON completed signup Discord notification build failed';
    return new;
end;
$$;

revoke all on function public.notify_discord_on_registration_completed()
  from public, anon, authenticated;
