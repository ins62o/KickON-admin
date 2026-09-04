-- Keep existing longer nicknames valid during rollout, while preventing any
-- new or changed nickname from exceeding eight characters.
alter table public.profiles
add constraint profiles_nickname_max_eight_characters_check
check (
  nickname = '' or char_length(nickname) between 2 and 8
) not valid;

comment on constraint profiles_nickname_max_eight_characters_check
on public.profiles is
  'New and updated nicknames must contain between 2 and 8 characters.';
