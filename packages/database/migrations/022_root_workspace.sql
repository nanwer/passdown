-- Which workspace an installation shows at its root.
--
-- This was a string in the application — 'repair-collective', the name of this
-- project's own development seed. The front page asserted that workspace
-- existed, so every installation that did not carry the seed answered 500, and
-- the same literal decided in two more places whether a published guide was
-- linked at /guides/x or /w/<workspace>/guides/x. On any other installation a
-- public guide was linked at the members-only path, which returns 404 to the
-- public it was published for.
--
-- The question underneath was never modelled, so it leaked into behaviour in
-- five files. Modelling it is the fix.

ALTER TABLE app.workspace ADD COLUMN root boolean NOT NULL DEFAULT false;

-- At most one, enforced rather than trusted. A partial index over a constant is
-- the standard way to say "at most one row may satisfy this".
CREATE UNIQUE INDEX workspace_single_root ON app.workspace((root)) WHERE root;

-- And it has to be a public workspace, because its library is the front page.
-- A private workspace at the root would put a members-only library where
-- anonymous visitors land, which is not a configuration worth allowing.
ALTER TABLE app.workspace
  ADD CONSTRAINT workspace_root_is_public CHECK (NOT root OR audience = 'public');

-- Existing installations keep the behaviour they have: whichever public
-- workspace was already being served at the root becomes the root, and an
-- installation with no public workspace simply has none, which the front page
-- now handles rather than crashing on.
UPDATE app.workspace SET root = true
WHERE id = (SELECT id FROM app.workspace WHERE audience = 'public' ORDER BY id LIMIT 1);

-- Readable by anyone who can see the workspace at all, which for a public
-- workspace is everybody — an anonymous visitor has to be able to resolve the
-- front page.
CREATE FUNCTION app.root_workspace() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT id FROM app.workspace WHERE root AND audience = 'public'
$$;

REVOKE ALL ON FUNCTION app.root_workspace() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.root_workspace() TO guide_runtime;
