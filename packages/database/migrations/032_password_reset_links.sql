-- Password reset links, installation administrators, and one path for every
-- password write.
--
-- Nothing in an installation sends email. A reset link is created by an
-- installation administrator in Studio, or by the operator with
-- `passdown reset-password`; a SHA-256 of a random token is stored and the
-- link is shown once. Using it replaces the password and ends every session of
-- the account. Installation administration is a capability of its own,
-- separate from workspace roles, granted only from the server command line:
-- managing a workspace never lets anyone reset an account.
-- Every credential change below takes the account row lock first, then reset
-- rows, then the password, then sessions, so no two of them can deadlock; and
-- the runtime role can no longer write a password except through these
-- functions.

CREATE TABLE app.password_reset (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES public.auth_user(id) ON DELETE CASCADE,
  token_hash text NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  issued_via text NOT NULL CHECK (issued_via IN ('operator', 'administrator')),
  -- Issuer snapshot, no foreign key: a reference would take a KEY SHARE lock on
  -- the issuing account (a lock cycle when two administrators reset each other)
  -- and would block deleting an administrator who ever issued a link.
  issued_by_id text,
  issued_by_email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text CHECK (revoked_reason IN ('replaced', 'cancelled', 'password-changed', 'restored')),
  CONSTRAINT password_reset_issuer
    CHECK ((issued_via = 'administrator') = (issued_by_id IS NOT NULL AND issued_by_email IS NOT NULL)),
  CONSTRAINT password_reset_closed_once CHECK (used_at IS NULL OR revoked_at IS NULL),
  CONSTRAINT password_reset_reason CHECK ((revoked_at IS NULL) = (revoked_reason IS NULL)),
  CONSTRAINT password_reset_lifetime
    CHECK (expires_at > created_at AND expires_at <= created_at + interval '24 hours')
);
CREATE UNIQUE INDEX password_reset_token ON app.password_reset(token_hash);
CREATE UNIQUE INDEX password_reset_open ON app.password_reset(user_id)
  WHERE used_at IS NULL AND revoked_at IS NULL;
ALTER TABLE app.password_reset ENABLE ROW LEVEL SECURITY;   -- no policy, no grant

CREATE TABLE app.account_audit (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  action text NOT NULL CHECK (action IN (
    'account.password_reset_issued', 'account.password_reset_revoked',
    'account.password_reset_redeemed', 'account.password_changed',
    'account.admin_granted', 'account.admin_revoked',
    'installation.restored')),
  target_user_id text,                   -- no foreign key: audit outlives accounts
  actor_kind text NOT NULL CHECK (actor_kind IN ('operator', 'administrator', 'account')),
  actor_id text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT account_audit_actor CHECK ((actor_kind = 'operator') = (actor_id IS NULL)),
  -- Every account event names its account; only the installation-wide restore event has none.
  CONSTRAINT account_audit_names_account CHECK ((target_user_id IS NULL) = (action = 'installation.restored'))
);
CREATE INDEX account_audit_target ON app.account_audit(target_user_id, created_at DESC);
ALTER TABLE app.account_audit ENABLE ROW LEVEL SECURITY;   -- no policy, no grant

-- Whether a stored or supplied value is a password hash the sign-in library
-- can verify. False, never NULL, for NULL or anything else.
CREATE FUNCTION app.usable_password_hash(h text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = pg_catalog AS $$
  SELECT coalesce(h ~ '^[0-9a-f]{32}:[0-9a-f]{128}$', false)
$$;

-- Step 1 of the protocol. Internal.
CREATE FUNCTION app.lock_account(target text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM 1 FROM public.auth_user u WHERE u.id = target FOR UPDATE;
  RETURN FOUND;
END $$;

-- Step 2: close open links of an account whose lock the caller holds. Internal.
CREATE FUNCTION app.close_password_resets(target text, why text, kind text, actor text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  closed record;
  n integer := 0;
BEGIN
  FOR closed IN
    UPDATE app.password_reset r SET revoked_at = now(), revoked_reason = why
    WHERE r.user_id = target AND r.used_at IS NULL AND r.revoked_at IS NULL
    RETURNING r.id
  LOOP
    INSERT INTO app.account_audit(action, target_user_id, actor_kind, actor_id, details)
    VALUES ('account.password_reset_revoked', target, kind, actor,
            jsonb_build_object('reset_id', closed.id, 'reason', why));
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- True only for a connection logged in as the owner of these tables (or a
-- member of that role). The runtime role is never a member of the owner role;
-- store.ts refuses to run otherwise.
CREATE FUNCTION app.session_is_owner() RETURNS boolean
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT coalesce(pg_has_role(session_user,
    (SELECT c.relowner FROM pg_class c WHERE c.oid = 'app.password_reset'::regclass), 'MEMBER'), false)
$$;

-- Issuing: operator only. No EXECUTE for the runtime, and a session check in
-- case a grant is ever added by mistake. Output names are prefixed because
-- plpgsql treats RETURNS TABLE names as variables (see 021).
CREATE FUNCTION app.operator_issue_password_reset(address text, hash text)
RETURNS TABLE(reset_id text, account_email text, reset_expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  target public.auth_user%ROWTYPE;
  issued app.password_reset%ROWTYPE;
  replaced integer;
BEGIN
  IF app.session_is_owner() IS NOT TRUE THEN
    RAISE EXCEPTION 'Only the operator can issue reset links' USING ERRCODE = '42501';
  END IF;
  IF (hash ~ '^[0-9a-f]{64}$') IS NOT TRUE THEN
    RAISE EXCEPTION 'Expected a token hash' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO target FROM public.auth_user u
  WHERE u.email = address
  FOR UPDATE;                                                     -- step 1
  IF NOT FOUND THEN RETURN; END IF;
  IF target.active IS NOT TRUE THEN
    RAISE EXCEPTION 'That account is suspended, so it cannot be given a reset link.' USING ERRCODE = '23514';
  END IF;
  IF target.email_verified IS NOT TRUE THEN
    RAISE EXCEPTION 'That account''s address has not been confirmed, so it cannot sign in.' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.auth_account a
                WHERE a.user_id = target.id AND a.provider_id = 'credential') THEN
    RAISE EXCEPTION 'That account does not sign in with a password.' USING ERRCODE = '23514';
  END IF;
  replaced := app.close_password_resets(target.id, 'replaced', 'operator', NULL);   -- step 2
  INSERT INTO app.password_reset(id, user_id, token_hash, issued_via, expires_at)
  VALUES (gen_random_uuid()::text, target.id, hash, 'operator', now() + interval '24 hours')
  RETURNING * INTO issued;
  INSERT INTO app.account_audit(action, target_user_id, actor_kind, actor_id, details)
  VALUES ('account.password_reset_issued', target.id, 'operator', NULL,
          jsonb_build_object('reset_id', issued.id, 'expires_at', issued.expires_at, 'replaced', replaced));
  RETURN QUERY SELECT issued.id, target.email, issued.expires_at;
END $$;

-- Restore activation: close every open link (reason 'restored').
-- Safe to repeat: a second call finds no open links and returns 0.
CREATE FUNCTION app.operator_close_all_password_resets() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  account text;
  n integer := 0;
BEGIN
  IF app.session_is_owner() IS NOT TRUE THEN
    RAISE EXCEPTION 'Only the operator can close reset links' USING ERRCODE = '42501';
  END IF;
  FOR account IN
    SELECT DISTINCT r.user_id FROM app.password_reset r
    WHERE r.used_at IS NULL AND r.revoked_at IS NULL ORDER BY r.user_id
  LOOP
    PERFORM app.lock_account(account);                            -- step 1
    n := n + app.close_password_resets(account, 'restored', 'operator', NULL);
  END LOOP;
  RETURN n;
END $$;

-- Restore activation: record that this installation was restored
-- from a backup (details such as the backup's time and version, never
-- secrets). Idempotent per restore: a resumed restore calls it again with the
-- same details->>'restoreId' and records nothing new.
CREATE UNIQUE INDEX account_audit_one_restore
  ON app.account_audit((details->>'restoreId')) WHERE action = 'installation.restored';
CREATE FUNCTION app.operator_record_restore(p_details jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF app.session_is_owner() IS NOT TRUE THEN
    RAISE EXCEPTION 'Only the operator can record a restore' USING ERRCODE = '42501';
  END IF;
  IF (length(btrim(p_details->>'restoreId')) > 0) IS NOT TRUE THEN
    RAISE EXCEPTION 'A restore record needs details.restoreId' USING ERRCODE = '22023';
  END IF;
  INSERT INTO app.account_audit(action, target_user_id, actor_kind, actor_id, details)
  VALUES ('installation.restored', NULL, 'operator', NULL, p_details)
  ON CONFLICT ((details->>'restoreId')) WHERE action = 'installation.restored' DO NOTHING;
END $$;

-- What the holder of a link is shown. Anything but a live link: no rows.
CREATE FUNCTION app.describe_password_reset(hash text)
RETURNS TABLE(account_id text, account_email text, account_name text, reset_expires_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT u.id, u.email, u.name, r.expires_at
  FROM app.password_reset r JOIN public.auth_user u ON u.id = r.user_id
  WHERE (hash ~ '^[0-9a-f]{64}$') IS TRUE
    AND r.token_hash = hash AND r.used_at IS NULL AND r.revoked_at IS NULL
    AND r.expires_at > now() AND u.active IS TRUE AND u.email_verified IS TRUE
$$;

-- Using a link. Authorization is possession of the token. Given hashes only.
CREATE FUNCTION app.redeem_password_reset(hash text, password_hash text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  target text;
  link app.password_reset%ROWTYPE;
  ended integer;
BEGIN
  IF app.usable_password_hash(password_hash) IS NOT TRUE THEN
    RAISE EXCEPTION 'Expected a password hash' USING ERRCODE = '22023';
  END IF;
  IF (hash ~ '^[0-9a-f]{64}$') IS NOT TRUE THEN RETURN NULL; END IF;
  SELECT r.user_id INTO target FROM app.password_reset r WHERE r.token_hash = hash;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM 1 FROM public.auth_user u WHERE u.id = target AND u.active IS TRUE AND u.email_verified IS TRUE FOR UPDATE;   -- step 1
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT * INTO link FROM app.password_reset r                                           -- step 2
  WHERE r.token_hash = hash AND r.user_id = target
    AND r.used_at IS NULL AND r.revoked_at IS NULL AND r.expires_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE app.password_reset SET used_at = now() WHERE id = link.id;
  UPDATE public.auth_account SET password = password_hash, updated_at = now()            -- step 3
  WHERE user_id = target AND provider_id = 'credential';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This account has no password to replace' USING ERRCODE = '23514';
  END IF;
  DELETE FROM public.auth_session WHERE user_id = target;                                -- step 4
  GET DIAGNOSTICS ended = ROW_COUNT;
  UPDATE public.auth_user SET must_change_password = false, updated_at = now()           -- step 5
  WHERE id = target;
  INSERT INTO app.account_audit(action, target_user_id, actor_kind, actor_id, details)   -- step 6
  VALUES ('account.password_reset_redeemed', target, 'account', target,
          jsonb_build_object('reset_id', link.id, 'sessions_ended', ended));
  RETURN target;
END $$;

-- Changing your own password. Acts only on the signed-in account; NULL from
-- any check is a refusal.
CREATE FUNCTION app.change_own_password(expected_hash text, new_hash text, keep_session text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  who text := app.actor_id();
  stored text;
  closed integer;
  ended integer;
BEGIN
  IF (current_setting('guide.actor_kind', true) = 'user' AND who IS NOT NULL
      AND app.actor_allowed()) IS NOT TRUE THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;
  IF app.usable_password_hash(new_hash) IS NOT TRUE OR expected_hash IS NULL THEN
    RAISE EXCEPTION 'Expected password hashes' USING ERRCODE = '22023';
  END IF;
  PERFORM app.lock_account(who);                                                         -- step 1
  closed := app.close_password_resets(who, 'password-changed', 'account', who);         -- step 2
  SELECT a.password INTO stored FROM public.auth_account a                               -- step 3
  WHERE a.user_id = who AND a.provider_id = 'credential' FOR UPDATE;
  IF stored IS DISTINCT FROM expected_hash THEN
    RAISE EXCEPTION 'The password changed while this request was being handled.' USING ERRCODE = '40001';
  END IF;
  UPDATE public.auth_account SET password = new_hash, updated_at = now()
  WHERE user_id = who AND provider_id = 'credential';
  DELETE FROM public.auth_session WHERE user_id = who AND id IS DISTINCT FROM keep_session;  -- step 4
  GET DIAGNOSTICS ended = ROW_COUNT;
  UPDATE public.auth_user SET must_change_password = false, updated_at = now() WHERE id = who;  -- step 5
  INSERT INTO app.account_audit(action, target_user_id, actor_kind, actor_id, details)   -- step 6
  VALUES ('account.password_changed', who, 'account', who,
          jsonb_build_object('sessions_ended', ended, 'links_closed', closed));
  RETURN ended;
END $$;

-- Installation administrators: installation-wide, separate from workspace
-- roles. Written only by the owner-connection functions below, the browser
-- setup function and this migration's backfill. Workspace scope never enters
-- into it. An installation always keeps at least one effective (active,
-- verified) administrator once it has one: revoking, deactivating or deleting
-- the last is refused. Every change to the administrator set takes the
-- account lock (step 1) and then one advisory lock for the whole set (step 1a),
-- so concurrent changes are counted one after another.
CREATE TABLE app.installation_admin (
  user_id text PRIMARY KEY REFERENCES public.auth_user(id) ON DELETE CASCADE,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_via text NOT NULL CHECK (granted_via IN ('setup', 'upgrade', 'command'))
);
ALTER TABLE app.installation_admin ENABLE ROW LEVEL SECURITY;   -- no policy, no grant

-- Whether the signed-in actor is an installation administrator. Anonymous,
-- suspended, unverified or absent is false, never NULL.
CREATE FUNCTION app.is_installation_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT coalesce(
    current_setting('guide.actor_kind', true) = 'user'
    AND app.actor_allowed()
    AND EXISTS(SELECT 1 FROM app.installation_admin a WHERE a.user_id = app.actor_id()),
  false)
$$;

-- Every account on the installation, for an administrator: searched and
-- bounded in the database, with each account's workspaces and any open link.
CREATE FUNCTION app.admin_list_accounts(q text, lim integer)
RETURNS TABLE(account_id text, account_name text, account_email text, account_active boolean,
  account_verified boolean, account_must_change boolean, account_is_administrator boolean,
  account_workspaces jsonb, pending_expires_at timestamptz, pending_issued_via text, matched bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF app.is_installation_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  WITH hits AS (
    SELECT u.* FROM public.auth_user u
    WHERE q IS NULL OR btrim(q) = ''
       OR strpos(app.normalized_name(u.name || ' ' || u.email), app.normalized_name(q)) > 0
  )
  SELECT f.id, f.name, f.email, f.active, f.email_verified, f.must_change_password,
    EXISTS(SELECT 1 FROM app.installation_admin a WHERE a.user_id = f.id),
    coalesce((SELECT jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'role', ms.role)
                               ORDER BY w.name)
              FROM app.membership ms JOIN app.workspace w ON w.id = ms.workspace_id
              WHERE ms.actor_id = f.id AND ms.active), '[]'::jsonb),
    r.expires_at, r.issued_via,
    count(*) OVER ()
  FROM hits f
  LEFT JOIN app.password_reset r
    ON r.user_id = f.id AND r.used_at IS NULL AND r.revoked_at IS NULL AND r.expires_at > now()
  ORDER BY lower(f.name), f.email, f.id
  LIMIT greatest(1, least(coalesce(lim, 100), 200));
END $$;

-- An administrator creates a link for another account.
CREATE FUNCTION app.admin_issue_password_reset(target text, hash text)
RETURNS TABLE(reset_id text, reset_expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  admin text := app.actor_id();
  admin_email text;
  account public.auth_user%ROWTYPE;
  issued app.password_reset%ROWTYPE;
  replaced integer;
BEGIN
  IF app.is_installation_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;
  IF target IS NULL OR (hash ~ '^[0-9a-f]{64}$') IS NOT TRUE THEN
    RAISE EXCEPTION 'Expected an account and a token hash' USING ERRCODE = '22023';
  END IF;
  IF target = admin THEN
    RAISE EXCEPTION 'Change your own password in Your account.' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO account FROM public.auth_user u WHERE u.id = target FOR UPDATE;   -- step 1
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such account' USING ERRCODE = 'P0002';
  END IF;
  IF account.active IS NOT TRUE THEN
    RAISE EXCEPTION 'That account is suspended, so it cannot sign in.' USING ERRCODE = '23514';
  END IF;
  IF account.email_verified IS NOT TRUE THEN
    RAISE EXCEPTION 'That account''s address has not been confirmed, so it cannot sign in.' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM public.auth_account a
                WHERE a.user_id = target AND a.provider_id = 'credential') THEN
    RAISE EXCEPTION 'That account does not sign in with a password.' USING ERRCODE = '23514';
  END IF;
  replaced := app.close_password_resets(target, 'replaced', 'administrator', admin);   -- step 2
  -- A plain read: no lock on the issuing account (see the issuer snapshot above).
  SELECT u.email INTO admin_email FROM public.auth_user u WHERE u.id = admin;
  INSERT INTO app.password_reset(id, user_id, token_hash, issued_via, issued_by_id, issued_by_email, expires_at)
  VALUES (gen_random_uuid()::text, target, hash, 'administrator', admin, admin_email, now() + interval '24 hours')
  RETURNING * INTO issued;
  INSERT INTO app.account_audit(action, target_user_id, actor_kind, actor_id, details)       -- step 6
  VALUES ('account.password_reset_issued', target, 'administrator', admin,
          jsonb_build_object('reset_id', issued.id, 'expires_at', issued.expires_at, 'replaced', replaced));
  RETURN QUERY SELECT issued.id, issued.expires_at;
END $$;

-- An administrator cancels an open link.
CREATE FUNCTION app.admin_cancel_password_reset(target text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF app.is_installation_admin() IS NOT TRUE THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;
  IF target IS NULL THEN
    RAISE EXCEPTION 'Expected an account' USING ERRCODE = '22023';
  END IF;
  IF app.lock_account(target) IS NOT TRUE THEN                                               -- step 1
    RAISE EXCEPTION 'No such account' USING ERRCODE = 'P0002';
  END IF;
  RETURN app.close_password_resets(target, 'cancelled', 'administrator', app.actor_id());    -- steps 2, 6
END $$;

-- Step 1a: one lock for the whole administrator set, always taken after the
-- account lock of the account being changed. Internal.
CREATE FUNCTION app.lock_admin_set() RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT pg_advisory_xact_lock(hashtextextended('passdown.installation_admin', 719821011))
$$;

-- Administrators who can actually sign in, other than one account. Internal;
-- only meaningful while the caller holds the administrator-set lock.
CREATE FUNCTION app.effective_admins_except(excluded text) RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT count(*) FROM app.installation_admin a JOIN public.auth_user u ON u.id = a.user_id
  WHERE a.user_id IS DISTINCT FROM excluded AND u.active IS TRUE AND u.email_verified IS TRUE
$$;

-- Grant, revoke and list: the server command line only (owner connection).
CREATE FUNCTION app.operator_grant_administrator(address text)
RETURNS TABLE(outcome text, account_email text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE account public.auth_user%ROWTYPE;
BEGIN
  IF app.session_is_owner() IS NOT TRUE THEN
    RAISE EXCEPTION 'Only the operator can grant administration' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO account FROM public.auth_user u
  WHERE u.email = address FOR UPDATE;       -- step 1
  IF NOT FOUND THEN RETURN QUERY SELECT 'no-account'::text, NULL::text; RETURN; END IF;
  PERFORM app.lock_admin_set();                                                        -- step 1a
  IF account.active IS NOT TRUE OR account.email_verified IS NOT TRUE THEN
    RAISE EXCEPTION 'That account cannot sign in, so it cannot be an administrator.' USING ERRCODE = '23514';
  END IF;
  IF EXISTS(SELECT 1 FROM app.installation_admin a WHERE a.user_id = account.id) THEN
    RETURN QUERY SELECT 'already'::text, account.email; RETURN;
  END IF;
  INSERT INTO app.installation_admin(user_id, granted_via) VALUES (account.id, 'command');
  INSERT INTO app.account_audit(action, target_user_id, actor_kind, actor_id, details)
  VALUES ('account.admin_granted', account.id, 'operator', NULL, '{"via":"command"}'::jsonb);
  RETURN QUERY SELECT 'granted'::text, account.email;
END $$;

CREATE FUNCTION app.operator_revoke_administrator(address text)
RETURNS TABLE(outcome text, account_email text, remaining bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE account public.auth_user%ROWTYPE;
BEGIN
  IF app.session_is_owner() IS NOT TRUE THEN
    RAISE EXCEPTION 'Only the operator can revoke administration' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO account FROM public.auth_user u
  WHERE u.email = address FOR UPDATE;       -- step 1
  IF NOT FOUND THEN RETURN QUERY SELECT 'no-account'::text, NULL::text, NULL::bigint; RETURN; END IF;
  PERFORM app.lock_admin_set();                                                        -- step 1a
  IF NOT EXISTS(SELECT 1 FROM app.installation_admin a WHERE a.user_id = account.id) THEN
    RETURN QUERY SELECT 'not-administrator'::text, account.email, NULL::bigint; RETURN;
  END IF;
  -- Never leave the installation without an administrator who
  -- can sign in. Revoking one who cannot sign in anyway changes nothing.
  IF account.active IS TRUE AND account.email_verified IS TRUE
     AND app.effective_admins_except(account.id) = 0 THEN
    RETURN QUERY SELECT 'last-administrator'::text, account.email, 0::bigint; RETURN;
  END IF;
  DELETE FROM app.installation_admin a WHERE a.user_id = account.id;
  INSERT INTO app.account_audit(action, target_user_id, actor_kind, actor_id, details)
  VALUES ('account.admin_revoked', account.id, 'operator', NULL, '{"via":"command"}'::jsonb);
  RETURN QUERY SELECT 'revoked'::text, account.email, app.effective_admins_except(NULL);
END $$;

CREATE FUNCTION app.operator_list_administrators()
RETURNS TABLE(account_email text, account_name text, admin_granted_at timestamptz, admin_granted_via text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF app.session_is_owner() IS NOT TRUE THEN
    RAISE EXCEPTION 'Only the operator can list administrators' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT u.email, u.name, a.granted_at, a.granted_via
    FROM app.installation_admin a JOIN public.auth_user u ON u.id = a.user_id
    ORDER BY a.granted_at, u.email;
END $$;

-- Browser setup: the account created there
-- becomes the installation administrator. Call this as the last step of
-- setup, in the same transaction as app.claim_first_workspace. It refuses
-- unless this is the installation's only account, it can sign in with a
-- usable password, and nobody
-- holds the capability, so after setup the runtime role cannot use it to grant
-- anything.
CREATE FUNCTION app.setup_installation_administrator(who text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE account public.auth_user%ROWTYPE;
BEGIN
  IF who IS NULL THEN
    RAISE EXCEPTION 'Expected an account' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO account FROM public.auth_user u WHERE u.id = who FOR UPDATE;           -- step 1
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No such account' USING ERRCODE = 'P0002';
  END IF;
  PERFORM app.lock_admin_set();                                                        -- step 1a
  IF (account.active AND account.email_verified) IS NOT TRUE THEN
    RAISE EXCEPTION 'The setup account cannot sign in yet.' USING ERRCODE = '23514';
  END IF;
  IF EXISTS(SELECT 1 FROM public.auth_account a
            WHERE a.user_id = who AND a.provider_id = 'credential'
              AND app.usable_password_hash(a.password)) IS NOT TRUE THEN
    RAISE EXCEPTION 'The setup account has no usable password.' USING ERRCODE = '23514';
  END IF;
  IF EXISTS(SELECT 1 FROM app.installation_admin)
     OR (SELECT count(*) FROM public.auth_user) <> 1 THEN
    RAISE EXCEPTION 'This installation has already been set up.' USING ERRCODE = '23514';
  END IF;
  INSERT INTO app.installation_admin(user_id, granted_via) VALUES (who, 'setup');
  INSERT INTO app.account_audit(action, target_user_id, actor_kind, actor_id, details)
  VALUES ('account.admin_granted', who, 'account', who, '{"via":"setup"}'::jsonb);
END $$;

-- The last effective administrator's account cannot be deactivated, lose its
-- confirmed address, or be deleted. The row lock of the UPDATE/DELETE is
-- step 1; the administrator-set lock is step 1a.
CREATE FUNCTION app.keep_an_administrator() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NOT EXISTS(SELECT 1 FROM app.installation_admin a WHERE a.user_id = OLD.id) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  PERFORM app.lock_admin_set();
  IF (OLD.active AND OLD.email_verified) IS TRUE AND app.effective_admins_except(OLD.id) = 0 THEN
    RAISE EXCEPTION 'This account is the last installation administrator. Grant someone else first with passdown admin grant.'
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN
    INSERT INTO app.account_audit(action, target_user_id, actor_kind, actor_id, details)
    VALUES ('account.admin_revoked', OLD.id, 'operator', NULL, '{"via":"account-deleted"}'::jsonb);
    RETURN OLD;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER installation_keeps_an_administrator_update
  BEFORE UPDATE OF active, email_verified ON public.auth_user
  FOR EACH ROW WHEN ((OLD.active AND NOT NEW.active) OR (OLD.email_verified AND NOT NEW.email_verified))
  EXECUTE FUNCTION app.keep_an_administrator();
CREATE TRIGGER installation_keeps_an_administrator_delete
  BEFORE DELETE ON public.auth_user
  FOR EACH ROW EXECUTE FUNCTION app.keep_an_administrator();

-- Existing installations: the oldest account that can sign in is the one the
-- generated-password first run created (or a local evaluation's seeded owner).
-- The operator checks with `passdown admin list` after upgrading.
INSERT INTO app.installation_admin(user_id, granted_via)
SELECT u.id, 'upgrade' FROM public.auth_user u
WHERE u.active AND u.email_verified
ORDER BY u.created_at, u.id
LIMIT 1;
INSERT INTO app.account_audit(action, target_user_id, actor_kind, actor_id, details)
SELECT 'account.admin_granted', a.user_id, 'operator', NULL, '{"via":"upgrade"}'::jsonb
FROM app.installation_admin a WHERE a.granted_via = 'upgrade';


-- The credential-write boundary. The runtime role can create one credential
-- for an account that has none (sign-up through the identity library for
-- invitations; the setup adapter). It cannot change a password, move a
-- credential to another account, change its provider, delete it, or add a
-- second one. A credential disappears only with its account, whose deletion
-- is guarded for the last administrator (app.keep_an_administrator). Every
-- password change goes through the functions above.
CREATE UNIQUE INDEX auth_account_one_credential
  ON public.auth_account(user_id) WHERE provider_id = 'credential';
CREATE FUNCTION app.guard_credential_insert() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.provider_id IS DISTINCT FROM 'credential' OR NEW.account_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'Only password sign-in is supported.' USING ERRCODE = '23514';
  END IF;
  IF app.usable_password_hash(NEW.password) IS NOT TRUE THEN
    RAISE EXCEPTION 'A new account needs a usable password.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER auth_account_credential_insert
  BEFORE INSERT ON public.auth_account
  FOR EACH ROW EXECUTE FUNCTION app.guard_credential_insert();
REVOKE UPDATE, DELETE ON public.auth_account FROM guide_runtime;
GRANT UPDATE (access_token, refresh_token, id_token, access_token_expires_at,
  refresh_token_expires_at, scope, updated_at)
  ON public.auth_account TO guide_runtime;
-- INSERT stays granted (first credential only: trigger plus unique index).

REVOKE ALL ON FUNCTION
  app.lock_account(text), app.close_password_resets(text, text, text, text), app.session_is_owner(),
  app.usable_password_hash(text),
  app.operator_issue_password_reset(text, text), app.operator_close_all_password_resets(),
  app.operator_record_restore(jsonb),
  app.describe_password_reset(text), app.redeem_password_reset(text, text),
  app.change_own_password(text, text, text),
  app.is_installation_admin(), app.admin_list_accounts(text, integer),
  app.admin_issue_password_reset(text, text), app.admin_cancel_password_reset(text),
  app.operator_grant_administrator(text), app.operator_revoke_administrator(text),
  app.operator_list_administrators(), app.setup_installation_administrator(text),
  app.lock_admin_set(), app.effective_admins_except(text), app.keep_an_administrator(),
  app.guard_credential_insert()
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  app.describe_password_reset(text), app.redeem_password_reset(text, text),
  app.change_own_password(text, text, text),
  app.is_installation_admin(), app.admin_list_accounts(text, integer),
  app.admin_issue_password_reset(text, text), app.admin_cancel_password_reset(text),
  app.setup_installation_administrator(text)
TO guide_runtime;
