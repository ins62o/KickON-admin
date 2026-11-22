-- Record of a forward change already applied to production (KickON) on 2026-11-22 around 09:05 KST
-- through the SQL Editor. This file is a record, not an approval to run it (see README.md).
--
-- Why: get_admin_push_recipients(p_kind, p_query, p_page, p_result, p_phase) counted delivery
-- targets and attempts for every candidate row of the kind (34,438 match rows) before taking a
-- page of 10. On a cold cache the call took 5.47s against its 5s statement_timeout.
-- Change: with p_result = 'all' (the screen's default), page straight from the candidates and count
-- targets and attempts only for the 10 page rows; the total is the candidate count, which is the
-- same set. The other result filters still compute the counts for every candidate, as before.
-- Inputs, output shape, ordering, the admin check and the 5s timeout are unchanged.
--
-- Verification on production: before the patch, the previous function and the new logic run inline
-- returned identical JSON for 14 combinations (kinds match_events, lineup, goal, community,
-- attendance, system; results all, success, failure, excluded, no_target; phase GOAL; search;
-- page 3; a page past the end). After the patch, 4 combinations matched the previous logic again.
-- Warm call time for match_events / all / page 1 fell from 0.88s to 0.51s; the cold-cache gain was
-- not measured.
--
-- The patch edits the deployed definition in place and refuses to run unless that definition is the
-- verified one. Definition before: md5 081edd1ae43b22836893ea969f8d412b.
-- Definition after: sha256 635e3b475ea00c76987a13a81d924a9fdd930ef1526d9f0a5acfb9b4a60fc1cf.

do $patch$ declare d text := pg_get_functiondef('public.get_admin_push_recipients(text,text,integer,text,text)'::regprocedure); begin if md5(d) <> '081edd1ae43b22836893ea969f8d412b' then raise exception 'UNEXPECTED_DEFINITION %', md5(d); end if; d := replace(replace(d, $a$  where p_result='all' or p_result='success' and targets.succeeded>0$a$, $b$  where p_result<>'all' and (p_result='success' and targets.succeeded>0$b$), $c$   or p_result='no_target' and r.status='COMPLETED' and targets.targets=0 and history.attempt_count=0
 ), page_rows as (
  select * from matching order by created_at desc,id desc limit 10 offset (p_page-1)*10
 )
 select jsonb_build_object('total',(select count(*) from matching),$c$, $n$   or p_result='no_target' and r.status='COMPLETED' and targets.targets=0 and history.attempt_count=0)
 ), filtered as (
  -- 'all' pages straight from the candidates; the other filters need the delivery counts first
  select id,created_at from candidates where p_result='all'
  union all
  select id,created_at from matching
 ), page_keys as (
  select id from filtered order by created_at desc,id desc limit 10 offset (p_page-1)*10
 ), page_rows as (
  select r.*,targets.*,history.attempt_count from candidates r
  join page_keys k on k.id=r.id
  cross join lateral (select count(*) as targets,
   count(*) filter(where status='SUCCEEDED') as succeeded,
   count(*) filter(where status in ('INVALID_TOKEN','PERMANENT_FAILURE','AUTH_CONFIGURATION')) as failed,
   count(*) filter(where status in ('PENDING','PROCESSING','RETRY')) as pending,
   count(*) filter(where status='UNKNOWN_OUTCOME') as unknown,
   count(*) filter(where status='SHADOWED') as shadowed,
   count(*) filter(where status='SUPPRESSED') as suppressed
   from public.push_delivery_targets where outbox_id=r.id) targets
  cross join lateral (select count(*) as attempt_count from public.push_delivery_attempts where outbox_id=r.id) history
 )
 select jsonb_build_object('total',(select count(*) from filtered),$n$); if encode(sha256(convert_to(d, 'UTF8')), 'hex') <> '635e3b475ea00c76987a13a81d924a9fdd930ef1526d9f0a5acfb9b4a60fc1cf' then raise exception 'UNEXPECTED_PATCH_RESULT'; end if; execute d; end $patch$;

-- Rollback (not part of the forward change): restores the exact previous definition.
-- do $rollback$ declare d text := pg_get_functiondef('public.get_admin_push_recipients(text,text,integer,text,text)'::regprocedure); begin if encode(sha256(convert_to(d, 'UTF8')), 'hex') <> '635e3b475ea00c76987a13a81d924a9fdd930ef1526d9f0a5acfb9b4a60fc1cf' then raise exception 'UNEXPECTED_DEFINITION'; end if; d := replace(replace(d, $n$   or p_result='no_target' and r.status='COMPLETED' and targets.targets=0 and history.attempt_count=0)
--  ), filtered as (
--   -- 'all' pages straight from the candidates; the other filters need the delivery counts first
--   select id,created_at from candidates where p_result='all'
--   union all
--   select id,created_at from matching
--  ), page_keys as (
--   select id from filtered order by created_at desc,id desc limit 10 offset (p_page-1)*10
--  ), page_rows as (
--   select r.*,targets.*,history.attempt_count from candidates r
--   join page_keys k on k.id=r.id
--   cross join lateral (select count(*) as targets,
--    count(*) filter(where status='SUCCEEDED') as succeeded,
--    count(*) filter(where status in ('INVALID_TOKEN','PERMANENT_FAILURE','AUTH_CONFIGURATION')) as failed,
--    count(*) filter(where status in ('PENDING','PROCESSING','RETRY')) as pending,
--    count(*) filter(where status='UNKNOWN_OUTCOME') as unknown,
--    count(*) filter(where status='SHADOWED') as shadowed,
--    count(*) filter(where status='SUPPRESSED') as suppressed
--    from public.push_delivery_targets where outbox_id=r.id) targets
--   cross join lateral (select count(*) as attempt_count from public.push_delivery_attempts where outbox_id=r.id) history
--  )
--  select jsonb_build_object('total',(select count(*) from filtered),$n$, $c$   or p_result='no_target' and r.status='COMPLETED' and targets.targets=0 and history.attempt_count=0
--  ), page_rows as (
--   select * from matching order by created_at desc,id desc limit 10 offset (p_page-1)*10
--  )
--  select jsonb_build_object('total',(select count(*) from matching),$c$), $b$  where p_result<>'all' and (p_result='success' and targets.succeeded>0$b$, $a$  where p_result='all' or p_result='success' and targets.succeeded>0$a$); if md5(d) <> '081edd1ae43b22836893ea969f8d412b' then raise exception 'ROLLBACK_RESULT_MISMATCH %', md5(d); end if; execute d; end $rollback$;
