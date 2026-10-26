CREATE OR REPLACE FUNCTION public.materialize_push_delivery_targets(p_worker_id uuid, p_outbox_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_lock_attempt integer;
  v_acquiring_config boolean := false;
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

  -- Bounded acquisition attempts; existing statement/I/O/COMMIT limits remain separate.
  for v_lock_attempt in 1..4 loop
    v_acquiring_config := false;
    begin
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

      -- No waiting for config while owning the parent.
      v_acquiring_config := true;
      lock table public.push_runtime_config in row share mode nowait;
      select config.max_targets_per_outbox into v_max_targets
      from public.push_runtime_config config
      where config.singleton
      for share nowait;
      v_acquiring_config := false;
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
    exception when lock_not_available then
      -- Preserve original lock failures outside the guarded config acquisition.
      if not v_acquiring_config then raise; end if;
      -- Exiting this subtransaction releases this attempt's locks before probing config.
      if v_lock_attempt = 4 then
        raise exception using errcode = '55P03', message = 'PUSH_LOCK_BUSY';
      end if;
    end;
    -- Wait for config only after the failed attempt released parent/target locks.
    begin
      lock table public.push_runtime_config in row share mode;
      perform 1 from public.push_runtime_config config where config.singleton for share;
      -- Roll back this probe to release config before reacquiring any parent.
      raise exception using errcode = 'PZ001', message = 'PUSH_CONFIG_PROBE_RELEASE';
    exception when sqlstate 'PZ001' then
      null;
    end;
  end loop;
  raise exception using errcode = '55P03', message = 'PUSH_LOCK_BUSY';
end;
$function$
