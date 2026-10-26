-- Count every post-detail open except the author's own opens.
-- post_views remains a signed-in, daily-unique activity ledger; it no longer
-- limits the public view_count shown in the community UI.

create or replace function public.increment_post_view(target_post_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  resulting_count integer;
  post_author_id uuid;
  viewer_user_id uuid := (select auth.uid());
begin
  select post.view_count, post.author_id
  into resulting_count, post_author_id
  from public.posts post
  where post.id = target_post_id
    and (
      post.board = 'LEAGUE'
      or (
        viewer_user_id is not null
        and post.team_id = (
          select profile.team_id
          from public.profiles profile
          where profile.id = viewer_user_id
        )
      )
    );

  if not found then
    raise exception 'POST_NOT_FOUND';
  end if;

  if post_author_id = auth.uid() then
    return resulting_count;
  end if;

  -- Preserve one daily read event for signed-in fan-activity calculations.
  if viewer_user_id is not null then
    insert into public.post_views (post_id, user_id, viewed_on)
    values (
      target_post_id,
      viewer_user_id,
      (now() at time zone 'Asia/Seoul')::date
    )
    on conflict do nothing;
  end if;

  update public.posts
  set view_count = view_count + 1
  where id = target_post_id
  returning view_count into resulting_count;

  return resulting_count;
end;
$$;

revoke all on function public.increment_post_view(uuid) from public;
grant execute on function public.increment_post_view(uuid) to anon, authenticated;

comment on function public.increment_post_view(uuid) is
  'Counts every non-author detail open. Signed-in daily read activity remains deduplicated in post_views.';
