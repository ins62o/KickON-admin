revoke update on public.posts from authenticated;
grant update (title, content, image_urls) on public.posts to authenticated;

drop policy if exists "users update own posts" on public.posts;
create policy "users update own posts"
on public.posts
for update
to authenticated
using (author_id = (select auth.uid()))
with check (author_id = (select auth.uid()));
