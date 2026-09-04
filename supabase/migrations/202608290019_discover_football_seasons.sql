grant select on public.football_provider_seasons to anon, authenticated;

drop policy if exists "public reads football provider seasons"
  on public.football_provider_seasons;
create policy "public reads football provider seasons"
  on public.football_provider_seasons
  for select
  to anon, authenticated
  using (true);

select public.invoke_football_data_sync(
  jsonb_build_object('mode', 'discover-seasons')
);
