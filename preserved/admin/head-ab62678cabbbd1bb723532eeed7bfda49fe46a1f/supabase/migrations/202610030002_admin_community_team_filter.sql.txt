begin;

create or replace function public.admin_get_community_posts(
  p_post_id uuid,
  p_query text,
  p_offset integer,
  p_limit integer,
  p_team_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_query text := '%' || left(trim(coalesce(p_query, '')), 200) || '%';
  v_result jsonb;
begin
  if coalesce((select auth.role()), '') <> 'service_role'
    and not public.admin_has_capability('moderation.read') then
    raise exception 'MODERATION_PERMISSION_REQUIRED' using errcode = '42501';
  end if;

  with matching as (
    select post.*, author.nickname as author_name, team.name as team_name
    from public.posts post
    left join public.profiles author on author.id = post.author_id
    left join public.teams team on team.id = post.team_id
    where (p_post_id is null or post.id = p_post_id)
      and (nullif(p_team_id, '') is null or post.team_id = p_team_id)
      and (p_post_id is not null or post.title ilike v_query
        or post.content ilike v_query or author.nickname ilike v_query
        or post.author_id::text ilike v_query or team.name ilike v_query)
  ), page_rows as (
    select * from matching
    order by created_at desc, id desc
    offset greatest(coalesce(p_offset, 0), 0)
    limit least(greatest(coalesce(p_limit, 50), 1), 100)
  )
  select jsonb_build_object(
    'total', (select count(*) from matching),
    'records', coalesce((
      select jsonb_agg(
        to_jsonb(post) || jsonb_build_object(
          'like_count', (select count(*) from public.post_likes liked where liked.post_id = post.id),
          'comment_count', (select count(*) from public.comments comment where comment.post_id = post.id),
          'comments', case when p_post_id is null then '[]'::jsonb else coalesce((
            select jsonb_agg(
              to_jsonb(comment) || jsonb_build_object('author_name', author.nickname)
              order by comment.created_at, comment.id
            )
            from public.comments comment
            left join public.profiles author on author.id = comment.user_id
            where comment.post_id = post.id
          ), '[]'::jsonb) end
        ) order by post.created_at desc, post.id desc
      ) from page_rows post
    ), '[]'::jsonb)
  ) into v_result;
  return v_result;
end;
$$;

-- Keep existing four-argument callers working without an ambiguous defaulted overload.
create or replace function public.admin_get_community_posts(
  p_post_id uuid default null,
  p_query text default '',
  p_offset integer default 0,
  p_limit integer default 50
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.admin_get_community_posts(p_post_id, p_query, p_offset, p_limit, null::text);
$$;

revoke all on function public.admin_get_community_posts(uuid, text, integer, integer, text) from public, anon;
grant execute on function public.admin_get_community_posts(uuid, text, integer, integer, text) to authenticated, service_role;

comment on function public.admin_get_community_posts(uuid, text, integer, integer, text) is
  'Paged community history with an exact post team filter and moderation capability checks.';

notify pgrst, 'reload schema';
commit;
