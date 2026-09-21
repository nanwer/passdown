-- An installation can create its own first administrator.
--
-- Until now the only account anywhere came from scripts/seed-local.ts, which
-- refuses to touch anything but a local database and plants demo content while
-- it is there. So a real deployment had no way to produce a first user at all,
-- and sign-up is disabled, which leaves nobody who can sign in.
--
-- The password that account starts with is generated per installation and never
-- shipped. A known default is below the floor set by CISA, whose Secure by
-- Design alert says outright that widely known default passwords are
-- unacceptable and that relying on customers to change them has been shown not
-- to work; the UK's PSTI Act has made them unlawful for consumer devices since
-- April 2024. This column is the other half of that: the account is unusable
-- for anything until its first password has been replaced.
--
-- Better Auth has no must-change-password concept of its own, so it lives here.
-- The guard it feeds has to cover the API and not just redirect the browser —
-- SonarQube forces its reset in the interface but exempts /api, which leaves
-- the initial credentials working indefinitely for anyone who skips the UI.
ALTER TABLE public.auth_user ADD COLUMN must_change_password boolean NOT NULL DEFAULT false;

-- Somewhere for that administrator to work.
--
-- Nothing in the product creates a workspace — they have only ever come from
-- the local seed script, which refuses to touch a real database. So an
-- installation that got an administrator and nothing else would start with an
-- empty studio and no way out of it.
--
-- guide_runtime may only read app.workspace, and that stays true: the running
-- application still has no authority to invent workspaces. This is one
-- deliberately narrow exception, and the database enforces the narrowness
-- rather than trusting the caller — it does nothing at all once a workspace
-- exists, so it cannot be used a second time, by anyone, for any reason.
CREATE FUNCTION app.claim_first_workspace(w text, nm text, actor_id text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM app.workspace) THEN
    RETURN false;
  END IF;
  INSERT INTO app.workspace(id, name, audience) VALUES (w, nm, 'public');
  INSERT INTO app.membership(workspace_id, actor_id, role) VALUES (w, actor_id, 'manage');
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION app.claim_first_workspace(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.claim_first_workspace(text, text, text) TO guide_runtime;
