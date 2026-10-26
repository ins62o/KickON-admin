-- Evaluate auth.uid() once per statement instead of once per scanned row.

alter policy "users update own profile" on public.profiles
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

alter policy "authenticated users read accessible posts" on public.posts
using (
  board = 'LEAGUE' or
  team_id = (
    select profile.team_id
    from public.profiles profile
    where profile.id = (select auth.uid())
  )
);

alter policy "users create own posts" on public.posts
with check (
  author_id = (select auth.uid()) and
  category = 'FREE' and
  team_id = (
    select profile.team_id
    from public.profiles profile
    where profile.id = (select auth.uid())
  )
);

alter policy "users delete own posts" on public.posts
using (author_id = (select auth.uid()));

alter policy "users create comments on accessible posts" on public.comments
with check (
  user_id = (select auth.uid()) and
  exists (
    select 1 from public.posts post
    where post.id = comments.post_id
  )
);

alter policy "users delete own comments" on public.comments
using (user_id = (select auth.uid()));

alter policy "users like accessible posts" on public.post_likes
with check (
  user_id = (select auth.uid()) and
  exists (
    select 1 from public.posts post
    where post.id = post_likes.post_id
  )
);

alter policy "users delete own likes" on public.post_likes
using (user_id = (select auth.uid()));

alter policy "users read own attendances" on public.attendances
using (user_id = (select auth.uid()));

alter policy "users read own notification preferences"
on public.notification_preferences
using (user_id = (select auth.uid()));

alter policy "users update own notification preferences"
on public.notification_preferences
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

alter policy "users read own notifications" on public.notifications
using (user_id = (select auth.uid()));

alter policy "users update own notifications" on public.notifications
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

alter policy "users upload own post images" on storage.objects
with check (
  bucket_id = 'post-images' and
  (storage.foldername(name))[1] = (select auth.uid())::text
);

alter policy "users delete own post images" on storage.objects
using (
  bucket_id = 'post-images' and
  (storage.foldername(name))[1] = (select auth.uid())::text
);
