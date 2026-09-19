-- Deactivation blocks on current assignments, not on history.
--
-- 007 refused to archive a category when ANY release referenced it, so a
-- category used by a single superseded release could never be retired. A
-- superseded release keeps its own frozen category reference and snapshot, so
-- it is not a reason to keep the category selectable forever.
--
-- Replaces app.check_category_tree in place. Every other rule in that function
-- is reproduced unchanged; only the archive condition differs. No release row
-- is rewritten.

CREATE OR REPLACE FUNCTION app.check_category_tree() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE bad boolean; ancestor_depth integer; descendant_depth integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.workspace_id, 719821007));
  IF TG_OP = 'UPDATE' AND (NEW.id <> OLD.id OR NEW.workspace_id <> OLD.workspace_id OR NEW.domain <> OLD.domain) THEN
    RAISE EXCEPTION 'Category identity and domain cannot change' USING ERRCODE = '23514';
  END IF;
  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'A category cannot be its own parent' USING ERRCODE = '23514';
  END IF;
  IF NEW.parent_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM app.category
    WHERE id = NEW.parent_id AND workspace_id = NEW.workspace_id AND domain = NEW.domain AND NOT archived
  ) THEN
    RAISE EXCEPTION 'Choose an active parent in this workspace and category tree' USING ERRCODE = '23514';
  END IF;
  WITH RECURSIVE ancestors AS (
    SELECT id, parent_id, visibility, 1 depth FROM app.category
    WHERE id = NEW.parent_id AND workspace_id = NEW.workspace_id
    UNION ALL
    SELECT p.id, p.parent_id, p.visibility, a.depth + 1 FROM app.category p
    JOIN ancestors a ON p.id = a.parent_id WHERE a.depth <= 16
  )
  SELECT coalesce(bool_or(id = NEW.id), false), coalesce(max(depth), 0)
  INTO bad, ancestor_depth FROM ancestors;
  IF bad THEN
    RAISE EXCEPTION 'A category cannot move below its own descendants' USING ERRCODE = '23514';
  END IF;
  WITH RECURSIVE descendants AS (
    SELECT id, 0 depth FROM app.category WHERE id = NEW.id
    UNION ALL
    SELECT c.id, d.depth + 1 FROM app.category c JOIN descendants d ON c.parent_id = d.id WHERE d.depth <= 16
  )
  SELECT coalesce(max(depth), 0) INTO descendant_depth FROM descendants;
  IF ancestor_depth + descendant_depth + 1 > 16 THEN
    RAISE EXCEPTION 'Category trees support at most 16 levels' USING ERRCODE = '23514';
  END IF;
  IF NEW.visibility = 'public' AND (
    EXISTS(SELECT 1 FROM app.workspace WHERE id = NEW.workspace_id AND audience = 'private')
    OR EXISTS(SELECT 1 FROM app.category WHERE id = NEW.parent_id AND visibility = 'members')
  ) THEN
    RAISE EXCEPTION 'Public categories require a public workspace and public parent' USING ERRCODE = '23514';
  END IF;

  -- Changed in 009: current assignments block, superseded releases do not.
  IF NEW.archived AND (
    EXISTS(SELECT 1 FROM app.category WHERE parent_id = NEW.id AND NOT archived)
    OR EXISTS(SELECT 1 FROM app.guide WHERE category_id = NEW.id AND state NOT IN ('redacted', 'withdrawn'))
    OR EXISTS(
      SELECT 1 FROM app.release r
      JOIN app.guide g ON g.workspace_id = r.workspace_id AND g.id = r.guide_id
      WHERE r.category_id = NEW.id
        AND r.number = g.current_release
        AND g.state NOT IN ('redacted', 'withdrawn')
    )
    OR EXISTS(SELECT 1 FROM app.catalog_item WHERE category_id = NEW.id AND NOT archived)
  ) THEN
    RAISE EXCEPTION 'Move child categories, assigned guides and active catalog items before archiving; superseded releases keep their own references'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.visibility = 'members' AND OLD.visibility = 'public' THEN
    IF EXISTS(SELECT 1 FROM app.category WHERE parent_id = NEW.id AND visibility = 'public') THEN
      RAISE EXCEPTION 'Restrict public child categories first' USING ERRCODE = '23514';
    END IF;
    IF EXISTS(
      SELECT 1 FROM app.release r JOIN app.guide g ON g.id = r.guide_id AND g.current_release = r.number
      WHERE r.category_id = NEW.id AND g.audience = 'public' AND g.state = 'published'
    ) OR EXISTS(SELECT 1 FROM app.catalog_item WHERE category_id = NEW.id AND visibility = 'public') THEN
      RAISE EXCEPTION 'This category has public releases or catalog items; resolve those references before restricting visibility'
        USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- What currently prevents a category being deactivated, so the interface can
-- explain it and offer a route instead of surfacing a raised exception.
CREATE FUNCTION app.category_blockers(w text, c text)
RETURNS TABLE (active_children bigint, assigned_guides bigint, current_releases bigint, active_items bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT
    (SELECT count(*) FROM app.category
      WHERE workspace_id = w AND parent_id = c AND NOT archived AND app.category_readable(w, id)),
    (SELECT count(*) FROM app.guide
      WHERE workspace_id = w AND category_id = c AND state NOT IN ('redacted', 'withdrawn')),
    (SELECT count(DISTINCT r.guide_id) FROM app.release r
      JOIN app.guide g ON g.workspace_id = r.workspace_id AND g.id = r.guide_id
      WHERE r.workspace_id = w AND r.category_id = c AND r.number = g.current_release
        AND g.state NOT IN ('redacted', 'withdrawn')),
    (SELECT count(*) FROM app.catalog_item
      WHERE workspace_id = w AND category_id = c AND NOT archived)
  WHERE app.category_readable(w, c)
$$;

REVOKE ALL ON FUNCTION app.category_blockers(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.category_blockers(text, text) TO guide_runtime;
