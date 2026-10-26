-- Supabase grants function EXECUTE to API roles by default. Make every exposed
-- RPC explicit so trigger and service-only functions cannot be invoked through
-- PostgREST.

alter function public.touch_updated_at() set search_path = '';
alter function public.enforce_team_change_cooldown() set search_path = '';
alter function public.fan_level_for_score(bigint) set search_path = '';

revoke execute on function public.touch_updated_at()
  from public, anon, authenticated;
revoke execute on function public.enforce_team_change_cooldown()
  from public, anon, authenticated;
revoke execute on function public.handle_new_auth_user()
  from public, anon, authenticated;
revoke execute on function public.sync_attendance_results()
  from public, anon, authenticated;
revoke execute on function public.create_community_comment_notification()
  from public, anon, authenticated;
revoke execute on function public.create_fixture_notifications()
  from public, anon, authenticated;

revoke execute on function public.sync_football_data(jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.sync_football_data(jsonb, jsonb, jsonb)
  to service_role;

revoke execute on function public.register_push_token(text, text)
  from public, anon, authenticated;
revoke execute on function public.unregister_push_token(text)
  from public, anon, authenticated;
revoke execute on function public.fan_activity_score(uuid)
  from public, anon, authenticated;
revoke execute on function public.search_community_posts(text, text, text)
  from public, anon, authenticated;
revoke execute on function public.increment_post_view(uuid)
  from public, anon, authenticated;
revoke execute on function public.create_gps_attendance(
  text,
  double precision,
  double precision
) from public, anon, authenticated;

grant execute on function public.register_push_token(text, text)
  to authenticated;
grant execute on function public.unregister_push_token(text)
  to authenticated;
grant execute on function public.fan_activity_score(uuid)
  to authenticated;
grant execute on function public.search_community_posts(text, text, text)
  to authenticated;
grant execute on function public.increment_post_view(uuid)
  to authenticated;
grant execute on function public.create_gps_attendance(
  text,
  double precision,
  double precision
) to authenticated;
