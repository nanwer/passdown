-- The workspace an installation creates for itself is the one it serves.
--
-- 022 gave an installation a way to name its root workspace. The first-run
-- bootstrap predates that and created a workspace without one, so a fresh
-- deployment came up with a front page that resolved to nothing — better than
-- the 500 it used to answer, and still not a working installation.
--
-- The function refuses once any workspace exists, so it can only ever be the
-- first, which is exactly the one that should be the root.
CREATE OR REPLACE FUNCTION app.claim_first_workspace(w text, nm text, actor_id text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF EXISTS(SELECT 1 FROM app.workspace) THEN
    RETURN false;
  END IF;
  INSERT INTO app.workspace(id, name, audience, root) VALUES (w, nm, 'public', true);
  INSERT INTO app.membership(workspace_id, actor_id, role) VALUES (w, actor_id, 'manage');
  RETURN true;
END $$;
