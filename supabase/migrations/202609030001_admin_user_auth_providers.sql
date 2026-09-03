create or replace function public.admin_get_user_auth_providers()
returns table (
  user_id uuid,
  auth_provider text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.admin_has_capability('users.read') then
    raise exception 'USER_ADMIN_PERMISSION_REQUIRED';
  end if;

  return query
  select
    profile.id,
    (
      select lower(identity.provider)
      from auth.identities identity
      where identity.user_id = profile.id
      order by
        case lower(identity.provider)
          when 'kakao' then 1
          when 'apple' then 2
          else 3
        end,
        identity.created_at asc
      limit 1
    )
  from public.profiles profile;
end;
$$;

revoke all on function public.admin_get_user_auth_providers()
  from public, anon;
grant execute on function public.admin_get_user_auth_providers()
  to authenticated, service_role;
