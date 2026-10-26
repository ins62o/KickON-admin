create table if not exists public.user_blocks (
  blocker_user_id uuid not null references public.profiles(id) on delete cascade,
  blocked_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id),
  constraint user_blocks_no_self_block check (blocker_user_id <> blocked_user_id)
);

create index if not exists user_blocks_blocked_user_idx
  on public.user_blocks (blocked_user_id, created_at desc);

alter table public.user_blocks enable row level security;

revoke all on table public.user_blocks from anon, authenticated;
grant select on table public.user_blocks to authenticated;

drop policy if exists "users read own blocks" on public.user_blocks;
create policy "users read own blocks"
  on public.user_blocks for select
  to authenticated
  using (blocker_user_id = auth.uid());

create or replace function public.set_user_block(
  target_user_id uuid,
  should_block boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if target_user_id is null then
    raise exception 'BLOCK_TARGET_REQUIRED';
  end if;

  if target_user_id = auth.uid() then
    raise exception 'CANNOT_BLOCK_SELF';
  end if;

  if not exists (
    select 1 from public.profiles where id = target_user_id
  ) then
    raise exception 'BLOCK_TARGET_NOT_FOUND';
  end if;

  if should_block then
    insert into public.user_blocks (blocker_user_id, blocked_user_id)
    values (auth.uid(), target_user_id)
    on conflict (blocker_user_id, blocked_user_id) do nothing;
  else
    delete from public.user_blocks
    where blocker_user_id = auth.uid()
      and blocked_user_id = target_user_id;
  end if;

  return should_block;
end;
$$;

revoke all on function public.set_user_block(uuid, boolean) from public, anon;
grant execute on function public.set_user_block(uuid, boolean) to authenticated;

comment on table public.user_blocks is
  'Per-user community block relationships. Only the blocker can read a row.';
comment on function public.set_user_block(uuid, boolean) is
  'Creates or removes the signed-in user block relationship.';
