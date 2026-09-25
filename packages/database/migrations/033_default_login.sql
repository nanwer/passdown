-- The default login, in place of the one-time setup code.
--
-- A fresh installation gets exactly one account when its migrations first run:
-- admin@example.com with the password "changeme", verified, active, the
-- installation administrator, and marked must_change_password. It is published
-- in the install guide, so it is worth nothing on its own: the account can do
-- one thing, Finish setting up, which replaces its email address and password,
-- creates the first workspace and retires the default login in one transaction.
-- Until then every studio route refuses it (requireSession), and nothing else
-- can change its password (the trigger below), so the default password stops
-- working only by finishing setup.
--
-- The account is created by the operator connection, never by the running
-- application, and only in a database with no accounts and no workspace: a
-- restored backup or any installation that has ever been set up never gets one.

CREATE TABLE app.default_login (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  user_id text NOT NULL UNIQUE REFERENCES public.auth_user(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app.default_login ENABLE ROW LEVEL SECURITY;   -- no policy, no grant

ALTER TABLE app.account_audit DROP CONSTRAINT account_audit_action_check;
ALTER TABLE app.account_audit ADD CONSTRAINT account_audit_action_check CHECK (action IN (
  'account.password_reset_issued', 'account.password_reset_revoked',
  'account.password_reset_redeemed', 'account.password_changed',
  'account.admin_granted', 'account.admin_revoked',
  'installation.restored',
  'account.default_login_created', 'account.setup_finished'));

-- Operator only. Returns the new account's id, or NULL when the database
-- already has an account or a workspace. The advisory lock is the one browser
-- setup used, so concurrent starts create at most one account.
CREATE FUNCTION app.operator_create_default_login(password_hash text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE who text := gen_random_uuid()::text;
BEGIN
  IF app.session_is_owner() IS NOT TRUE THEN
    RAISE EXCEPTION 'Only the operator can create the default login' USING ERRCODE = '42501';
  END IF;
  IF app.usable_password_hash(password_hash) IS NOT TRUE THEN
    RAISE EXCEPTION 'Expected a password hash' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(719821009);
  IF EXISTS(SELECT 1 FROM public.auth_user) OR EXISTS(SELECT 1 FROM app.workspace) THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.auth_user(id, name, email, email_verified, active, must_change_password)
  VALUES (who, 'Administrator', 'admin@example.com', true, true, true);
  INSERT INTO public.auth_account(id, account_id, provider_id, user_id, password)
  VALUES (gen_random_uuid()::text, who, 'credential', who, password_hash);
  INSERT INTO app.installation_admin(user_id, granted_via) VALUES (who, 'setup');
  INSERT INTO app.default_login(user_id) VALUES (who);
  INSERT INTO app.account_audit(action, target_user_id, actor_kind, actor_id, details) VALUES
    ('account.default_login_created', who, 'operator', NULL, '{}'::jsonb),
    ('account.admin_granted', who, 'operator', NULL, '{"via":"setup"}'::jsonb);
  RETURN who;
END $$;

-- 'default-login' while the default login is waiting to be replaced,
-- 'no-account' when nobody can sign in at all, otherwise 'complete'.
CREATE FUNCTION app.setup_state() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT CASE
    WHEN EXISTS(SELECT 1 FROM app.default_login) THEN 'default-login'
    WHEN NOT EXISTS(SELECT 1 FROM public.auth_user) THEN 'no-account'
    ELSE 'complete' END
$$;

-- The default login's account id, or NULL once setup is finished.
CREATE FUNCTION app.default_login_account() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT user_id FROM app.default_login
$$;

-- Finish setting up, as the signed-in default login. Steps follow the
-- credential protocol of 032: account lock, reset links, password, sessions,
-- flag, audit. The default login row goes first, so the password trigger
-- below allows this one password write.
CREATE FUNCTION app.finish_setup(new_name text, new_email text, new_hash text, keep_session text,
  w text, nm text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  who text := app.actor_id();
  closed integer;
  ended integer;
BEGIN
  IF (current_setting('guide.actor_kind', true) = 'user' AND who IS NOT NULL
      AND app.actor_allowed()) IS NOT TRUE THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;
  IF app.usable_password_hash(new_hash) IS NOT TRUE THEN
    RAISE EXCEPTION 'Expected a password hash' USING ERRCODE = '22023';
  END IF;
  IF new_name IS NULL OR btrim(new_name) = '' OR length(new_name) > 120 THEN
    RAISE EXCEPTION 'Enter your name.' USING ERRCODE = '23514';
  END IF;
  IF new_email IS NULL OR new_email !~ '^[^@[:space:]]+@[^@[:space:]]+$' OR length(new_email) > 200
     OR new_email <> lower(new_email) THEN
    RAISE EXCEPTION 'Enter a valid email address.' USING ERRCODE = '23514';
  END IF;
  IF new_email = 'admin@example.com' THEN
    RAISE EXCEPTION 'Use your own email address, not admin@example.com.' USING ERRCODE = '23514';
  END IF;
  IF w IS NULL OR nm IS NULL OR btrim(nm) = '' OR length(nm) > 80 THEN
    RAISE EXCEPTION 'Enter a workspace name.' USING ERRCODE = '23514';
  END IF;
  PERFORM app.lock_account(who);                                                         -- step 1
  PERFORM pg_advisory_xact_lock(719821009);
  DELETE FROM app.default_login d WHERE d.user_id = who;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Setup is already finished' USING ERRCODE = 'P0002';
  END IF;
  UPDATE public.auth_user SET name = btrim(new_name), email = new_email,
    must_change_password = false, updated_at = now()                                    -- step 5
  WHERE id = who;
  closed := app.close_password_resets(who, 'password-changed', 'account', who);         -- step 2
  UPDATE public.auth_account SET password = new_hash, updated_at = now()                 -- step 3
  WHERE user_id = who AND provider_id = 'credential';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This account has no password to replace' USING ERRCODE = '23514';
  END IF;
  DELETE FROM public.auth_session WHERE user_id = who AND id IS DISTINCT FROM keep_session;  -- step 4
  GET DIAGNOSTICS ended = ROW_COUNT;
  IF app.claim_first_workspace(w, nm, who) IS NOT TRUE THEN
    RAISE EXCEPTION 'This database already contains a workspace. Restore a complete backup or use a new empty database.'
      USING ERRCODE = '23514';
  END IF;
  INSERT INTO app.account_audit(action, target_user_id, actor_kind, actor_id, details)   -- step 6
  VALUES ('account.setup_finished', who, 'account', who,
          jsonb_build_object('workspace', w, 'sessions_ended', ended, 'links_closed', closed));
  RETURN ended;
END $$;

-- While the default login exists, its password changes only through
-- app.finish_setup: not by changing your own password, a reset link, or the
-- operator's reset command. Otherwise the account could keep the published
-- address with no workspace, and the sign-in page would still offer a password
-- that no longer works.
CREATE FUNCTION app.guard_default_login_password() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM app.default_login d WHERE d.user_id = NEW.user_id) THEN
    RAISE EXCEPTION 'Sign in with admin@example.com and finish setting up first.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER auth_account_default_login_password
  BEFORE UPDATE OF password ON public.auth_account
  FOR EACH ROW WHEN (OLD.password IS DISTINCT FROM NEW.password)
  EXECUTE FUNCTION app.guard_default_login_password();

REVOKE ALL ON FUNCTION
  app.operator_create_default_login(text), app.setup_state(), app.default_login_account(),
  app.finish_setup(text, text, text, text, text, text), app.guard_default_login_password()
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  app.setup_state(), app.default_login_account(),
  app.finish_setup(text, text, text, text, text, text)
TO guide_runtime;
