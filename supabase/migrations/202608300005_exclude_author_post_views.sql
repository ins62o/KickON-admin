create or replace function public.increment_post_view(target_post_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
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

  update public.posts
  set view_count = view_count + 1
  where id = target_post_id
  returning view_count into resulting_count;

  return resulting_count;
end;
$$;

revoke all on function public.increment_post_view(uuid) from public;
grant execute on function public.increment_post_view(uuid) to authenticated;

comment on function public.increment_post_view(uuid) is
  'Increments every signed-in non-author post detail open.';
