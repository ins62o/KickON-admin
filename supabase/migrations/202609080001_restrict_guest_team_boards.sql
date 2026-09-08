-- Guests may browse the league-wide community, but team boards are available
-- only after authentication. Existing restrictive visibility policies continue
-- to apply alongside this board-level policy.
drop policy if exists "guests read posts" on public.posts;
create policy "guests read league posts"
  on public.posts for select to anon
  using (board = 'LEAGUE');
