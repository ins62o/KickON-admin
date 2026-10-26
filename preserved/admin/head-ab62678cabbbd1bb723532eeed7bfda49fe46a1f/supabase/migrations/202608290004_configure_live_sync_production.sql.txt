-- Remote Edge Function URLs are environment-specific and must not be embedded
-- in a shared migration. Configure kickon_live_football_sync_url after deploy
-- with the matching file under supabase/operations/environments/.
do $$
begin
  raise notice 'Configure the live football function URL for this environment after deploy.';
end;
$$;
