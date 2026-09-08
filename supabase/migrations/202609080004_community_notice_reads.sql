begin;

-- Existing members start tracking from this migration, preventing historical
-- notices from all appearing as unread when the feature is first released.
alter table public.profiles
  add column if not exists notice_tracking_started_at timestamptz
  not null default now();

revoke update (notice_tracking_started_at)
  on public.profiles from anon, authenticated;

create table if not exists public.community_notice_reads (
  user_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid not null references public.posts(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create index if not exists community_notice_reads_post_idx
  on public.community_notice_reads (post_id, read_at desc);
create index if not exists posts_visible_notice_scope_idx
  on public.posts (board, team_id, created_at desc)
  where category = 'NOTICE' and moderation_status = 'VISIBLE';

alter table public.community_notice_reads enable row level security;
revoke all on public.community_notice_reads from public, anon, authenticated;
grant select on public.community_notice_reads to authenticated;

drop policy if exists "users read own notice receipts"
  on public.community_notice_reads;
create policy "users read own notice receipts"
  on public.community_notice_reads for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.get_unread_community_notices(
  target_board text,
  target_team_id text default null
)
returns setof public.community_post_feed
language sql
stable
set search_path = ''
as $$
  select notice
  from public.community_post_feed notice
  join public.profiles viewer on viewer.id = (select auth.uid())
  where notice.category = 'NOTICE'
    and notice.board = target_board
    and (target_board <> 'TEAM' or notice.team_id = target_team_id)
    and notice.created_at >= greatest(
      coalesce(viewer.registration_completed_at, viewer.created_at),
      viewer.notice_tracking_started_at
    )
    and notice.created_at <= now()
    and not exists (
      select 1
      from public.community_notice_reads receipt
      where receipt.user_id = viewer.id
        and receipt.post_id = notice.id
    )
  order by notice.created_at desc, notice.id asc;
$$;

revoke all on function public.get_unread_community_notices(text, text)
  from public, anon;
grant execute on function public.get_unread_community_notices(text, text)
  to authenticated;

create or replace function public.mark_community_notice_read(
  target_post_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if current_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.posts notice
    join public.profiles viewer on viewer.id = current_user_id
    where notice.id = target_post_id
      and notice.category = 'NOTICE'
      and notice.moderation_status = 'VISIBLE'
      and (
        notice.board = 'LEAGUE'
        or (notice.board = 'TEAM' and notice.team_id = viewer.team_id)
      )
  ) then
    raise exception 'NOTICE_NOT_ACCESSIBLE';
  end if;

  insert into public.community_notice_reads (user_id, post_id, read_at)
  values (current_user_id, target_post_id, now())
  on conflict (user_id, post_id) do update
    set read_at = excluded.read_at;
end;
$$;

revoke all on function public.mark_community_notice_read(uuid)
  from public, anon;
grant execute on function public.mark_community_notice_read(uuid)
  to authenticated;

-- The admin console should use this RPC rather than the mobile post-creation
-- flow. NOTICE is enforced server-side and capability checked for every call.
create or replace function public.admin_create_community_notice(
  target_board text,
  target_team_id text,
  notice_title text,
  notice_content text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_admin_id uuid := (select auth.uid());
  current_admin_team_id text;
  resolved_team_id text;
  created_post_id uuid;
begin
  if current_admin_id is null
    or not public.admin_has_capability('moderation.write') then
    raise exception 'ADMIN_PERMISSION_REQUIRED';
  end if;

  if target_board not in ('LEAGUE', 'TEAM') then
    raise exception 'INVALID_NOTICE_BOARD';
  end if;

  select profile.team_id
  into current_admin_team_id
  from public.profiles profile
  where profile.id = current_admin_id;

  if target_board = 'TEAM' then
    resolved_team_id := nullif(trim(target_team_id), '');
  else
    resolved_team_id := coalesce(
      current_admin_team_id,
      nullif(trim(target_team_id), '')
    );
  end if;

  if resolved_team_id is null or not exists (
    select 1 from public.teams team where team.id = resolved_team_id
  ) then
    raise exception 'VALID_NOTICE_TEAM_REQUIRED';
  end if;

  insert into public.posts (
    board,
    team_id,
    category,
    title,
    content,
    image_urls,
    author_id
  ) values (
    target_board,
    resolved_team_id,
    'NOTICE',
    trim(notice_title),
    trim(notice_content),
    '{}',
    current_admin_id
  )
  returning id into created_post_id;

  return created_post_id;
end;
$$;

revoke all on function public.admin_create_community_notice(
  text, text, text, text
) from public, anon;
grant execute on function public.admin_create_community_notice(
  text, text, text, text
) to authenticated;

comment on table public.community_notice_reads is
  'Per-user receipts created only after an accessible community notice detail is opened.';
comment on function public.admin_create_community_notice(
  text, text, text, text
) is
  'Creates NOTICE-category posts for administrators with moderation.write capability.';

notify pgrst, 'reload schema';

commit;
