-- Completion is assigned by a BEFORE trigger while the app updates nickname,
-- team_id, or consent fields. UPDATE OF only considers the original SET list,
-- so it misses registration_completed_at changes made by that BEFORE trigger.
drop trigger if exists profiles_notify_discord_after_registration_completed
  on public.profiles;

create trigger profiles_notify_discord_after_registration_completed
after update on public.profiles
for each row
when (
  old.registration_completed_at is null
  and new.registration_completed_at is not null
)
execute function public.notify_discord_on_registration_completed();

comment on trigger profiles_notify_discord_after_registration_completed
  on public.profiles is
  'Queues a signup alert when profile setup first completes, including completion assigned by a BEFORE trigger.';
