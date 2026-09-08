-- Replace the league-wide free-board taxonomy while preserving the existing
-- team-board categories and moderator-only notices.
alter table public.posts
  drop constraint if exists posts_category_check;

update public.posts
set category = 'CHAT'
where board = 'LEAGUE'
  and category = 'FREE';

alter table public.posts
  add constraint posts_category_check check (
    category in (
      'FREE', 'CHEER', 'REVIEW', 'NOTICE',
      'CHAT', 'HUMOR', 'NEWS', 'QUESTION'
    )
  );

alter policy "users create own posts" on public.posts
with check (
  author_id = (select auth.uid())
  and team_id = (
    select profile.team_id
    from public.profiles profile
    where profile.id = (select auth.uid())
  )
  and (
    (board = 'LEAGUE' and category in ('CHAT', 'HUMOR', 'NEWS', 'QUESTION'))
    or
    (board = 'TEAM' and category in ('FREE', 'CHEER', 'REVIEW'))
  )
);
