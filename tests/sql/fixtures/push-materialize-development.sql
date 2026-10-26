CREATE OR REPLACE FUNCTION public.materialize_push_delivery_targets(p_worker_id uuid, p_outbox_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_outbox public.push_outbox%rowtype;
  v_inserted integer := 0;
  v_max_targets integer;
  v_target_snapshot jsonb;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED';
  end if;
  if p_worker_id is null or p_outbox_id is null then
    raise exception 'INVALID_PUSH_MATERIALIZATION_SCOPE';
  end if;

  select outbox.* into v_outbox
  from public.push_outbox outbox
  where outbox.id = p_outbox_id
  for update;

  if not found then
    raise exception 'PUSH_OUTBOX_NOT_FOUND';
  end if;
  if v_outbox.status <> 'PROCESSING'
    or v_outbox.lease_owner is distinct from p_worker_id
    or v_outbox.lease_expires_at is null
    or v_outbox.lease_expires_at <= now() then
    raise exception 'PUSH_LEASE_OWNER_MISMATCH';
  end if;
  if v_outbox.targets_materialized_at is not null then
    return 0;
  end if;

  select config.max_targets_per_outbox into v_max_targets
  from public.push_runtime_config config
  where config.singleton
  for share;
  select coalesce(jsonb_agg(to_jsonb(snapshot)), '[]'::jsonb)
  into v_target_snapshot
  from (
    select
      token.user_id,
      token.token,
      token.platform,
      token.apns_environment,
      token.bundle_id
    from public.push_tokens token
    where token.user_id = v_outbox.user_id
    limit (v_max_targets + 1)
  ) snapshot;
  if jsonb_array_length(v_target_snapshot) > v_max_targets then
    raise exception 'PUSH_TARGET_LIMIT_EXCEEDED';
  end if;

  insert into public.push_delivery_targets (
    outbox_id, user_id, token, token_hash, platform,
    apns_environment, bundle_id
  )
  select
    v_outbox.id,
    snapshot.user_id,
    snapshot.token,
    encode(
      extensions.digest(convert_to(snapshot.token, 'UTF8'), 'sha256'),
      'hex'
    ),
    snapshot.platform,
    snapshot.apns_environment,
    snapshot.bundle_id
  from jsonb_to_recordset(v_target_snapshot) snapshot(
    user_id uuid,
    token text,
    platform text,
    apns_environment text,
    bundle_id text
  )
  on conflict (outbox_id, token_hash) do nothing;
  get diagnostics v_inserted = row_count;

  update public.push_outbox outbox
  set duplicate_suppressed_count =
        jsonb_array_length(v_target_snapshot) - v_inserted,
      targets_materialized_at = now(), updated_at = now()
  where outbox.id = v_outbox.id;

  return v_inserted;
end;
$function$
