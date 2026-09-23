-- A private workspace has no public side, and its catalog should say so.
--
-- Migration 015 made an item's visibility its own fact rather than something
-- inherited from a category, which was right. But it made `visibility='public'`
-- sufficient on its own, without asking whether the workspace it lives in has a
-- public side at all. In a private workspace — where the interface offers no
-- such choice, but the API accepts it — an item marked public became readable
-- by any signed-in account with no membership.
--
-- The guide path has always had this rule: `Private workspace guides must be
-- members-only`. The catalog did not, so the same mistake was reachable there.
--
-- Public stays public in a public workspace. Membership still reads everything.
-- Only the combination that should never have existed is closed.

CREATE OR REPLACE FUNCTION app.catalog_readable(w text, i text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT app.in_scope(w) AND app.actor_allowed() AND EXISTS(
    SELECT 1 FROM app.catalog_item x
    JOIN app.workspace ws ON ws.id = x.workspace_id
    WHERE x.workspace_id = w AND x.id = i
      AND (
        (x.visibility = 'public' AND ws.audience = 'public')
        OR app.member_role(w) IS NOT NULL
      )
  )
$$;

-- And the combination cannot be written in the first place, so the data stops
-- carrying a claim the rules refuse to honour.
CREATE FUNCTION app.check_catalog_visibility() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.visibility = 'public'
     AND (SELECT audience FROM app.workspace WHERE id = NEW.workspace_id) = 'private' THEN
    RAISE EXCEPTION 'A private workspace has no public catalog.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER catalog_visibility_matches_workspace
  BEFORE INSERT OR UPDATE OF visibility, workspace_id ON app.catalog_item
  FOR EACH ROW EXECUTE FUNCTION app.check_catalog_visibility();

REVOKE ALL ON FUNCTION app.check_catalog_visibility() FROM PUBLIC;
