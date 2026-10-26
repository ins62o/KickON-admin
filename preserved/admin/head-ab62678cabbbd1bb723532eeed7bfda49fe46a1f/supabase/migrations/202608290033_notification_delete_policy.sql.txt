grant delete on public.notifications to authenticated;

drop policy if exists "users delete own notifications" on public.notifications;
create policy "users delete own notifications"
on public.notifications
for delete
to authenticated
using (user_id = (select auth.uid()));

comment on policy "users delete own notifications" on public.notifications is
  'Allows signed-in users to delete only notifications addressed to their own account.';
