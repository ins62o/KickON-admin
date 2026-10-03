begin;

-- Include qualifying posts regardless of age; preserve reaction thresholds and score decay.
create or replace function public.get_community_popular_post_summaries(
  target_board text,
  target_team_id text default null,
  highlighted_only boolean default false
)
returns setof public.community_post_feed
language sql
stable
set search_path = ''
as $$
  with candidates as (
    select
      feed as post_row,
      (
        (2 * feed.ranking_like_count + feed.ranking_commenter_count)::double precision
        / (
          1 + extract(epoch from (now() - feed.created_at))
            / (12 * 60 * 60)
        )
      ) as popularity_score
    from public.community_post_feed feed
    where feed.board = target_board
      and (target_board <> 'TEAM' or feed.team_id = target_team_id)
      and feed.created_at <= now()
      and not public.is_current_user_blocking(feed.author_id)
      and (
        (target_board = 'LEAGUE'
          and feed.ranking_like_count >= 3
          and feed.ranking_reactor_count >= 5)
        or
        (target_board = 'TEAM'
          and feed.ranking_like_count >= 2
          and feed.ranking_reactor_count >= 3)
      )
  ), ranked as (
    select
      candidate.post_row,
      candidate.popularity_score,
      row_number() over (
        partition by (candidate.post_row).author_id
        order by
          candidate.popularity_score desc,
          (candidate.post_row).ranking_like_count desc,
          (candidate.post_row).created_at desc,
          (candidate.post_row).id asc
      ) as author_rank
    from candidates candidate
  )
  select ranked.post_row
  from ranked
  where not highlighted_only or ranked.author_rank = 1
  order by
    ranked.popularity_score desc,
    (ranked.post_row).ranking_like_count desc,
    (ranked.post_row).created_at desc,
    (ranked.post_row).id asc
  limit case when highlighted_only then 2 else null end;
$$;

revoke all on function public.get_community_popular_post_summaries(
  text, text, boolean
) from public;
grant execute on function public.get_community_popular_post_summaries(
  text, text, boolean
) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
