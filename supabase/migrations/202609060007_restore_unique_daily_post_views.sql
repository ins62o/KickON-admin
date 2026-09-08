create or replace function public.increment_post_view(target_post_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
  resulting_count integer;
  post_author_id uuid;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select post.view_count, post.author_id
  into resulting_count, post_author_id
  from public.posts post
  where post.id = target_post_id
    and (
      post.board = 'LEAGUE' or
      post.team_id = (
        select profile.team_id
        from public.profiles profile
        where profile.id = auth.uid()
      )
    );

  if not found then
    raise exception 'POST_NOT_FOUND';
  end if;

  if post_author_id = auth.uid() then
    return resulting_count;
  end if;

  insert into public.post_views (post_id, user_id, viewed_on)
  values (target_post_id, auth.uid(), current_date)
  on conflict do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count > 0 then
    update public.posts
    set view_count = view_count + 1
    where id = target_post_id
    returning view_count into resulting_count;
  else
    select post.view_count into resulting_count
    from public.posts post
    where post.id = target_post_id;
  end if;

  return resulting_count;
end;
$$;

revoke all on function public.increment_post_view(uuid) from public;
grant execute on function public.increment_post_view(uuid) to authenticated;

comment on function public.increment_post_view(uuid) is
  'Counts one view per signed-in non-author user and post per day.';
