-- Record of a forward change already applied to production (KickON) on 2026-11-23 around 10:41 KST through the
-- SQL Editor. This file is a record, not an approval to run it (see README.md). App-owned policies.
-- Replaying it is refused by its own guard (POLICY_DRIFT).
--
-- Why: 56 public tables share the RESTRICTIVE policy "data center active accounts access app", which called
-- can_current_user_access_app() once per candidate row (632 rows: 15 ms and 1,552 buffer hits).
-- Change: USING and WITH CHECK call it through a scalar subquery, so it is evaluated once per statement. The
-- function, roles, command and the condition itself do not change. official_active_read and
-- historical_v2_active_read already use this form.
--
-- Verification before (temporary tables only, always rolled back): for an active, missing, suspended, formerly suspended
-- and profile-less account, select/update/insert/delete gave identical results with both forms; the suspended cases used
-- a temporary copy of the function, because no account is suspended in production.
-- Verification after: 56 policies in the new form and the other 155 policies unchanged (md5 8b37a89d...). As an app user 15
-- of 15 repeated reads returned the same row counts as before; authenticated without a user id still sees 0 rows; guest
-- (anon) reads still work. No API response of 400 or above in the 8 minutes around the change. Times (3rd run, ms):
--   team_players K2 26.1 -> 11.6, player_scoring_stats K1 15.4 -> 3.7, fixtures K2 15.4 -> 8.7,
--   football_player_localizations 35.2 -> 6.7, profiles 1000 rows 35.3 -> 12.2, comments 28.4 -> 21.1,
--   popular posts 56.5 -> 52.2, community feed 20.8 -> 20.4.
-- Not changed: the storage.objects policy of the same kind, the write-community policies and
-- historical_official_results_read_v1. New tables should use the subquery form.
--
-- Rollback (not part of the change): the same block with the two forms swapped, i.e. for each of the 56 tables
--   alter policy "data center active accounts access app" on public.<table>
--     using (public.can_current_user_access_app()) with check (public.can_current_user_access_app());

do $fix$
declare
  v_table text;
  v_count integer;
  v_tables text;
  v_other_before text;
  v_other_after text;
begin
  perform set_config('lock_timeout', '1s', true);
  if (select md5(pg_get_functiondef('public.can_current_user_access_app()'::regprocedure))) <> 'e934de65cb7df0152c3b3ed03de20bfe' then
    raise exception 'FUNCTION_DRIFT'; end if;
  select count(*), md5(string_agg(schemaname || '.' || tablename, ',' order by tablename)) into v_count, v_tables
  from pg_policies where schemaname = 'public' and policyname = 'data center active accounts access app' and permissive = 'RESTRICTIVE'
    and cmd = 'ALL' and roles = '{authenticated}' and qual = 'can_current_user_access_app()' and with_check = 'can_current_user_access_app()';
  if v_count <> 56 or v_tables <> 'a14c9eac67742d9f49d089c41ac2327c' then raise exception 'POLICY_DRIFT % %', v_count, v_tables; end if;
  select md5(string_agg(concat_ws('|', schemaname, tablename, policyname, permissive, cmd, roles::text, qual, with_check), E'\n'
    order by schemaname, tablename, policyname)) into v_other_before
  from pg_policies where not (schemaname = 'public' and policyname = 'data center active accounts access app');

  for v_table in select tablename from pg_policies where schemaname = 'public'
    and policyname = 'data center active accounts access app' order by tablename loop
    execute format('alter policy "data center active accounts access app" on public.%I using ((select public.can_current_user_access_app())) with check ((select public.can_current_user_access_app()))', v_table);
  end loop;

  select count(*), md5(string_agg(schemaname || '.' || tablename, ',' order by tablename)) into v_count, v_tables
  from pg_policies where schemaname = 'public' and policyname = 'data center active accounts access app' and permissive = 'RESTRICTIVE'
    and cmd = 'ALL' and roles = '{authenticated}' and qual = '( SELECT can_current_user_access_app() AS can_current_user_access_app)' and with_check = '( SELECT can_current_user_access_app() AS can_current_user_access_app)';
  if v_count <> 56 or v_tables <> 'a14c9eac67742d9f49d089c41ac2327c' then raise exception 'FINAL_CHECK % %', v_count, v_tables; end if;
  select md5(string_agg(concat_ws('|', schemaname, tablename, policyname, permissive, cmd, roles::text, qual, with_check), E'\n'
    order by schemaname, tablename, policyname)) into v_other_after
  from pg_policies where not (schemaname = 'public' and policyname = 'data center active accounts access app');
  if v_other_after is distinct from v_other_before then raise exception 'OTHER_POLICY_CHANGED'; end if;
end
$fix$;
