alter table public.profiles
add column nickname_changed_at timestamptz;

update public.profiles
set nickname_changed_at = created_at
where nickname <> '';

create or replace function public.enforce_nickname_change_cooldown()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.nickname is distinct from old.nickname then
    if old.nickname <> ''
      and old.nickname_changed_at is not null
      and old.nickname_changed_at > now() - interval '30 days' then
      raise exception 'NICKNAME_CHANGE_COOLDOWN';
    end if;
    new.nickname_changed_at = now();
  else
    new.nickname_changed_at = old.nickname_changed_at;
  end if;
  return new;
end;
$$;

create trigger profiles_enforce_nickname_change_cooldown
before update on public.profiles
for each row execute function public.enforce_nickname_change_cooldown();

revoke execute on function public.enforce_nickname_change_cooldown()
from public, anon, authenticated;
