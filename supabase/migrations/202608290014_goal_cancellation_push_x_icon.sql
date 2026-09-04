do $migration$
declare
  function_definition text;
begin
  select pg_get_functiondef('public.create_goal_notifications()'::regprocedure)
  into function_definition;

  if position('↩️ ' in function_definition) = 0 then
    raise exception 'EXPECTED_GOAL_CANCELLATION_TITLE_NOT_FOUND';
  end if;

  execute replace(function_definition, '↩️ ', '❌ ');
end;
$migration$;

comment on function public.create_goal_notifications() is
  'Creates deduplicated goal and rescinded-goal pushes with an X cancellation icon and the current score.';
