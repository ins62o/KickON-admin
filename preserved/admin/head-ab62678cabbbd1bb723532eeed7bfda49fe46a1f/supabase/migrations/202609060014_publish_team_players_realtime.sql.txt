-- RealtimeSync subscribes to team_players in the same channel as notifications.
-- An unpublished table rejects all Postgres-change bindings on that channel.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'team_players'
  ) then
    alter publication supabase_realtime add table public.team_players;
  end if;
end;
$$;
