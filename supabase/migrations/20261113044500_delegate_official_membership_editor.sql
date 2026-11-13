-- Grant this feature individually without expanding an administrator's general role.
CREATE SCHEMA kickon_membership_admin;
REVOKE ALL ON SCHEMA kickon_membership_admin FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE kickon_membership_admin.editors (
  user_id uuid PRIMARY KEY REFERENCES public.admin_users(user_id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now()
);

-- Only the batch wrapper can authorize its nested canonical calls. Requests cannot set this context.
CREATE TABLE kickon_membership_admin.batch_context (
  transaction_id bigint NOT NULL,
  backend_pid integer NOT NULL,
  user_id uuid NOT NULL,
  PRIMARY KEY (transaction_id, backend_pid)
);

ALTER TABLE kickon_membership_admin.editors ENABLE ROW LEVEL SECURITY;
ALTER TABLE kickon_membership_admin.batch_context ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA kickon_membership_admin FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.admin_can_apply_official_memberships()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.role() IS NOT DISTINCT FROM 'authenticated' AND EXISTS (
    SELECT 1 FROM public.admin_users a
    WHERE a.user_id=(SELECT auth.uid()) AND a.is_active AND (
      a.role='super_admin' OR (a.role='admin' AND EXISTS (
        SELECT 1 FROM kickon_membership_admin.editors e WHERE e.user_id=a.user_id
      ))
    )
  );
$$;
REVOKE ALL ON FUNCTION public.admin_can_apply_official_memberships() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_can_apply_official_memberships() TO authenticated;

CREATE OR REPLACE FUNCTION public.canonical_membership_actor()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.admin_users a
    WHERE a.user_id=actor AND a.is_active AND (
      a.role='super_admin' OR (a.role='admin' AND EXISTS (
        SELECT 1 FROM kickon_membership_admin.batch_context c
        JOIN kickon_membership_admin.editors e ON e.user_id=c.user_id
        WHERE c.transaction_id=pg_catalog.txid_current_if_assigned()
          AND c.backend_pid=pg_catalog.pg_backend_pid() AND c.user_id=actor
      ))
    )
  ) THEN
    RAISE EXCEPTION 'CANONICAL_SUPER_ADMIN_REQUIRED';
  END IF;
  RETURN actor;
END;
$$;

ALTER FUNCTION public.admin_apply_official_memberships(jsonb) SET SCHEMA kickon_membership_admin;
ALTER FUNCTION kickon_membership_admin.admin_apply_official_memberships(jsonb) RENAME TO apply_batch;
REVOKE ALL ON FUNCTION kickon_membership_admin.apply_batch(jsonb) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.admin_apply_official_memberships(p_batch jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
SET default_transaction_isolation = 'repeatable read'
SET lock_timeout = '4s'
AS $$
DECLARE
  batch_transaction bigint;
  batch_backend integer;
  result jsonb;
BEGIN
  IF NOT public.admin_can_apply_official_memberships() THEN
    RAISE EXCEPTION 'CANONICAL_SUPER_ADMIN_REQUIRED' USING ERRCODE='42501';
  END IF;
  batch_transaction := pg_catalog.txid_current();
  batch_backend := pg_catalog.pg_backend_pid();
  INSERT INTO kickon_membership_admin.batch_context(transaction_id,backend_pid,user_id)
    VALUES(batch_transaction,batch_backend,auth.uid());

  result := kickon_membership_admin.apply_batch(p_batch);

  DELETE FROM kickon_membership_admin.batch_context
    WHERE transaction_id=batch_transaction AND backend_pid=batch_backend;
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_apply_official_memberships(jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_apply_official_memberships(jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
