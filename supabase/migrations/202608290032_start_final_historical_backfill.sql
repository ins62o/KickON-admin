-- Runs once after every schema, mapping and empty-response safeguard required
-- by the historical import is present. Successful environments return null.
select public.invoke_initial_football_history_backfill();
