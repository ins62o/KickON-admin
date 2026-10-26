-- Guests can browse current football data and public community content.
-- All personal data and every write operation remain authenticated-only.

grant select on public.teams to anon;
grant select on public.stadiums to anon;
grant select on public.fixtures to anon;
grant select on public.league_standings to anon;
grant select on public.player_scoring_stats to anon;
grant select on public.team_players to anon;
grant select on public.fixture_lineups to anon;
grant select on public.fixture_lineup_players to anon;
grant select on public.head_to_head_fixtures to anon;
grant select on public.head_to_head_sync_state to anon;

drop policy if exists "guests read teams" on public.teams;
create policy "guests read teams"
  on public.teams for select to anon using (true);

drop policy if exists "guests read stadiums" on public.stadiums;
create policy "guests read stadiums"
  on public.stadiums for select to anon using (true);

drop policy if exists "guests read fixtures" on public.fixtures;
create policy "guests read fixtures"
  on public.fixtures for select to anon using (true);

drop policy if exists "guests read standings" on public.league_standings;
create policy "guests read standings"
  on public.league_standings for select to anon using (true);

drop policy if exists "guests read scoring stats"
  on public.player_scoring_stats;
create policy "guests read scoring stats"
  on public.player_scoring_stats for select to anon using (true);

drop policy if exists "guests read team players" on public.team_players;
create policy "guests read team players"
  on public.team_players for select to anon using (true);

drop policy if exists "guests read fixture lineups"
  on public.fixture_lineups;
create policy "guests read fixture lineups"
  on public.fixture_lineups for select to anon using (true);

drop policy if exists "guests read fixture lineup players"
  on public.fixture_lineup_players;
create policy "guests read fixture lineup players"
  on public.fixture_lineup_players for select to anon using (true);

drop policy if exists "guests read head to head fixtures"
  on public.head_to_head_fixtures;
create policy "guests read head to head fixtures"
  on public.head_to_head_fixtures for select to anon using (true);

drop policy if exists "guests read head to head sync state"
  on public.head_to_head_sync_state;
create policy "guests read head to head sync state"
  on public.head_to_head_sync_state for select to anon using (true);

-- Community feed views use security_invoker, so their source tables also need
-- read-only grants and policies for the anonymous API role.
revoke select on public.profiles from anon;
grant select (id, nickname, team_id) on public.profiles to anon;
grant select on public.posts to anon;
grant select on public.comments to anon;
grant select on public.post_likes to anon;

drop policy if exists "guests read community profiles" on public.profiles;
create policy "guests read community profiles"
  on public.profiles for select to anon
  using (team_id is not null and nickname <> '');

drop policy if exists "guests read posts" on public.posts;
create policy "guests read posts"
  on public.posts for select to anon using (true);

drop policy if exists "guests read comments" on public.comments;
create policy "guests read comments"
  on public.comments for select to anon
  using (
    exists (
      select 1 from public.posts post
      where post.id = comments.post_id
    )
  );

drop policy if exists "guests read likes" on public.post_likes;
create policy "guests read likes"
  on public.post_likes for select to anon
  using (
    exists (
      select 1 from public.posts post
      where post.id = post_likes.post_id
    )
  );

grant select on public.community_post_feed to anon;
grant select on public.community_comment_feed to anon;
grant execute on function public.fan_level_for_user(uuid) to anon;
grant execute on function public.search_community_posts(text, text, text)
  to anon;
