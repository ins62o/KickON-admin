create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

create or replace function public.enqueue_discord_admin_notification(payload jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  webhook_url text;
begin
  select decrypted_secret into webhook_url
  from vault.decrypted_secrets
  where name = 'discord_admin_notifications_webhook_url'
  limit 1;

  if webhook_url is null then
    raise warning 'KickON Discord webhook Vault secret is missing';
    return;
  end if;

  if webhook_url !~ '^https://(canary\.|ptb\.)?discord\.com/api/webhooks/' then
    raise warning 'KickON Discord webhook Vault secret has an invalid origin';
    return;
  end if;

  perform net.http_post(
    url := webhook_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := payload,
    timeout_milliseconds := 5000
  );
exception
  when others then
    -- Discord delivery must never roll back signup or inquiry creation. Avoid
    -- logging SQLERRM because a networking error may contain the secret URL.
    raise warning 'KickON Discord webhook enqueue failed';
end;
$$;

revoke all on function public.enqueue_discord_admin_notification(jsonb)
  from public, anon, authenticated;

create or replace function public.notify_discord_on_profile_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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
              'name', '가입 시각',
              'value', to_char(new.created_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') || ' KST',
              'inline', true
            )
          ),
          'timestamp', new.created_at
        )
      )
    )
  );
  return new;
exception
  when others then
    raise warning 'KickON signup Discord notification build failed';
    return new;
end;
$$;

revoke all on function public.notify_discord_on_profile_created()
  from public, anon, authenticated;

drop trigger if exists profiles_notify_discord_after_insert on public.profiles;
create trigger profiles_notify_discord_after_insert
after insert on public.profiles
for each row execute function public.notify_discord_on_profile_created();

create or replace function public.notify_discord_on_support_inquiry_created()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester_nickname text;
  category_label text;
begin
  select nullif(trim(profile.nickname), '') into requester_nickname
  from public.profiles profile
  where profile.id = new.user_id;

  category_label := case new.category
    when 'APP_ERROR' then '앱 오류'
    when 'DATA_ERROR' then '데이터 오류'
    when 'ACCOUNT' then '계정'
    when 'NOTIFICATION' then '알림'
    when 'ATTENDANCE' then '직관 인증'
    when 'COMMUNITY' then '커뮤니티'
    when 'SUGGESTION' then '제안'
    else '기타'
  end;

  perform public.enqueue_discord_admin_notification(
    jsonb_build_object(
      'username', 'KickON 운영 알림',
      'allowed_mentions', jsonb_build_object('parse', jsonb_build_array()),
      'embeds', jsonb_build_array(
        jsonb_build_object(
          'title', '새 1:1 문의가 도착했습니다',
          'description', left(new.content, 1000),
          'color', 15844367,
          'fields', jsonb_build_array(
            jsonb_build_object(
              'name', '닉네임',
              'value', coalesce(requester_nickname, '닉네임 설정 전'),
              'inline', true
            ),
            jsonb_build_object(
              'name', '분류',
              'value', category_label,
              'inline', true
            ),
            jsonb_build_object(
              'name', '제목',
              'value', new.subject,
              'inline', false
            ),
            jsonb_build_object(
              'name', '문의 ID',
              'value', '`' || new.id::text || '`',
              'inline', false
            ),
            jsonb_build_object(
              'name', '접수 시각',
              'value', to_char(new.created_at at time zone 'Asia/Seoul', 'YYYY-MM-DD HH24:MI') || ' KST',
              'inline', true
            )
          ),
          'timestamp', new.created_at
        )
      )
    )
  );
  return new;
exception
  when others then
    raise warning 'KickON support inquiry Discord notification build failed';
    return new;
end;
$$;

revoke all on function public.notify_discord_on_support_inquiry_created()
  from public, anon, authenticated;

drop trigger if exists support_inquiries_notify_discord_after_insert on public.support_inquiries;
create trigger support_inquiries_notify_discord_after_insert
after insert on public.support_inquiries
for each row execute function public.notify_discord_on_support_inquiry_created();

comment on function public.enqueue_discord_admin_notification(jsonb) is
  'Queues a Discord operations alert through pg_net using a Vault-managed webhook URL.';
comment on trigger profiles_notify_discord_after_insert on public.profiles is
  'Sends a non-blocking Discord alert when a new KickON profile is created.';
comment on trigger support_inquiries_notify_discord_after_insert on public.support_inquiries is
  'Sends a non-blocking Discord alert when a new 1:1 inquiry is created.';
