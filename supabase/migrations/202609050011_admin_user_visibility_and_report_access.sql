begin;

-- 관리자 인증 계정은 서비스 사용자 목록에서 제외할 수 있도록 별도로 조회한다.
create or replace function public.admin_get_admin_user_ids()
returns table (user_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.admin_has_capability('users.read') then
    raise exception 'USER_ADMIN_PERMISSION_REQUIRED';
  end if;

  return query
  select administrator.user_id
  from public.admin_users administrator;
end;
$$;

revoke all on function public.admin_get_admin_user_ids()
  from public, anon;
grant execute on function public.admin_get_admin_user_ids()
  to authenticated, service_role;

-- 아직 전체 데이터 센터 마이그레이션을 적용하지 않은 운영 DB에서도
-- 신고 대상을 사용자 화면에 노출하지 않고 테스트·관리할 수 있게 보정한다.
alter table public.posts
  add column if not exists moderation_status text not null default 'VISIBLE',
  add column if not exists moderated_at timestamptz;

alter table public.comments
  add column if not exists moderation_status text not null default 'VISIBLE',
  add column if not exists moderated_at timestamptz;

alter table public.fixture_cheer_messages
  add column if not exists moderation_status text not null default 'VISIBLE',
  add column if not exists moderated_at timestamptz;

do $$
declare
  target_table regclass;
  constraint_name text;
begin
  foreach target_table in array array[
    'public.posts'::regclass,
    'public.comments'::regclass,
    'public.fixture_cheer_messages'::regclass
  ] loop
    constraint_name := replace(target_table::text, '.', '_') || '_moderation_status_check';
    if not exists (
      select 1 from pg_constraint
      where conrelid = target_table and conname = constraint_name
    ) then
      execute format(
        'alter table %s add constraint %I check (moderation_status in (''VISIBLE'', ''HIDDEN''))',
        target_table,
        constraint_name
      );
    end if;
  end loop;
end
$$;

-- 운영 관리자 세션에서 신고 목록을 읽을 수 있도록 테이블 권한과 RLS를 보정한다.
alter table public.content_reports enable row level security;

grant select on table public.content_reports to authenticated;

drop policy if exists "data center moderators read content reports"
  on public.content_reports;
create policy "data center moderators read content reports"
  on public.content_reports for select to authenticated
  using (public.admin_has_capability('moderation.read'));

commit;
