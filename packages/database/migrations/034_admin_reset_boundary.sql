-- An installation administrator can no longer create a reset link for another
-- installation administrator.
--
-- Administration is granted and revoked only from the server command line
-- (032), yet one administrator could take over another by issuing a link for
-- them and using it. Resetting an administrator now needs the same access as
-- granting administration: the operator's `reset-password` command, which is
-- unchanged. Refusing your own account (use Your account) stays as it was.
--
-- Same signature and result, so existing grants carry over; they are stated
-- again below for anyone reading this file alone.

CREATE OR REPLACE FUNCTION app.admin_issue_password_reset(target text, hash text)
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
  -- Checked under the account lock, which granting administration also takes
  -- first, so a grant cannot slip in between this check and the link.
  IF EXISTS(SELECT 1 FROM app.installation_admin a WHERE a.user_id = target) THEN
    RAISE EXCEPTION 'Another installation administrator''s password can only be reset from the server: docker compose run --rm ops reset-password --email %', account.email
      USING ERRCODE = '23514';
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
  -- A plain read: no lock on the issuing account (see the issuer snapshot in 032).
  SELECT u.email INTO admin_email FROM public.auth_user u WHERE u.id = admin;
  INSERT INTO app.password_reset(id, user_id, token_hash, issued_via, issued_by_id, issued_by_email, expires_at)
  VALUES (gen_random_uuid()::text, target, hash, 'administrator', admin, admin_email, now() + interval '24 hours')
  RETURNING * INTO issued;
  INSERT INTO app.account_audit(action, target_user_id, actor_kind, actor_id, details)       -- step 6
  VALUES ('account.password_reset_issued', target, 'administrator', admin,
          jsonb_build_object('reset_id', issued.id, 'expires_at', issued.expires_at, 'replaced', replaced));
  RETURN QUERY SELECT issued.id, issued.expires_at;
END $$;

REVOKE ALL ON FUNCTION app.admin_issue_password_reset(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.admin_issue_password_reset(text, text) TO guide_runtime;
