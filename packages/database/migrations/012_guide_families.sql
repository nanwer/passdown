-- Guide families: an overview guide with model and variant guides beneath it.
--
-- This is a different axis from the category tree. A category says what kind
-- of thing a guide is about; a family says this guide is a narrower case of
-- that one — "LG fridges" above a particular model above a particular
-- revision. A guide has a place in both, and conflating them would force one
-- to stand in for the other.
--
-- It is also not a prerequisite relation. A child does not have to be done
-- after its parent; it is the same job, described more specifically.

CREATE TABLE app.guide_family(
  workspace_id text NOT NULL,
  -- One parent per child, so the structure is a tree and a reader always has
  -- exactly one way up. Several parents would make "where am I" ambiguous
  -- without buying anything a product line needs.
  child_guide_id text NOT NULL,
  parent_guide_id text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0 CHECK(sort_order >= 0 AND sort_order <= 100000),
  PRIMARY KEY(workspace_id, child_guide_id),
  FOREIGN KEY(workspace_id, child_guide_id) REFERENCES app.guide(workspace_id, id),
  FOREIGN KEY(workspace_id, parent_guide_id) REFERENCES app.guide(workspace_id, id),
  CHECK(child_guide_id <> parent_guide_id)
);
CREATE INDEX guide_family_parent ON app.guide_family(workspace_id, parent_guide_id, sort_order);

-- Rejects a link that would make a guide its own ancestor, and bounds depth so
-- a walk up or down is always cheap.
CREATE FUNCTION app.check_guide_family() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE cycles boolean; ancestor_depth integer; descendant_depth integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.workspace_id, 719821009));
  WITH RECURSIVE ancestors AS (
    SELECT parent_guide_id AS id, 1 AS depth FROM app.guide_family
    WHERE workspace_id = NEW.workspace_id AND child_guide_id = NEW.parent_guide_id
    UNION ALL
    SELECT f.parent_guide_id, a.depth + 1 FROM app.guide_family f
    JOIN ancestors a ON f.child_guide_id = a.id
    WHERE f.workspace_id = NEW.workspace_id AND a.depth <= 8
  )
  SELECT coalesce(bool_or(id = NEW.child_guide_id), false), coalesce(max(depth), 0)
  INTO cycles, ancestor_depth FROM ancestors;
  IF cycles THEN
    RAISE EXCEPTION 'A guide cannot sit beneath one of its own variants' USING ERRCODE = '23514';
  END IF;
  WITH RECURSIVE descendants AS (
    SELECT child_guide_id AS id, 1 AS depth FROM app.guide_family
    WHERE workspace_id = NEW.workspace_id AND parent_guide_id = NEW.child_guide_id
    UNION ALL
    SELECT f.child_guide_id, d.depth + 1 FROM app.guide_family f
    JOIN descendants d ON f.parent_guide_id = d.id
    WHERE f.workspace_id = NEW.workspace_id AND d.depth <= 8
  )
  SELECT coalesce(max(depth), 0) INTO descendant_depth FROM descendants;
  IF ancestor_depth + descendant_depth + 2 > 8 THEN
    RAISE EXCEPTION 'Guide families support at most 8 levels' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guide_family_integrity
  BEFORE INSERT OR UPDATE ON app.guide_family
  FOR EACH ROW EXECUTE FUNCTION app.check_guide_family();

ALTER TABLE app.guide_family ENABLE ROW LEVEL SECURITY;

-- A link is visible only when both ends are. That is what lets a public child
-- stay independently discoverable while its private parent, and the fact that
-- it has one, stay hidden.
CREATE POLICY guide_family_read ON app.guide_family FOR SELECT
  USING(
    app.in_scope(workspace_id)
    AND app.release_readable(workspace_id, child_guide_id)
    AND app.release_readable(workspace_id, parent_guide_id)
  );
CREATE POLICY guide_family_owner ON app.guide_family FOR ALL
  USING(app.in_scope(workspace_id) AND app.member_role(workspace_id) = 'owner')
  WITH CHECK(app.in_scope(workspace_id) AND app.member_role(workspace_id) = 'owner');

REVOKE ALL ON FUNCTION app.check_guide_family() FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.guide_family TO guide_runtime;
