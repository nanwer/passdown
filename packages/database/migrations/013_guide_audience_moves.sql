-- Moving a guide between the public and internal sections of a workspace.
--
-- Audience was immutable from the first migration, which made the decision
-- permanent at the moment an author knew least about the guide. It is the
-- ordinary case that a procedure is drafted internally and later worth
-- publishing, or that something published turns out to be specific to one team.
--
-- Immutability was doing real work, though, and removing it without replacing
-- it would be a mistake. Everything a public reader can reach must itself be
-- public: the category a guide is filed under, and the catalog items its
-- current release names. Publishing already enforces that for a new release;
-- these checks enforce the same rule for a guide that becomes public without
-- being republished.
--
-- The other direction needs no permission. Moving into the internal section
-- only ever removes access, so it is never blocked — but it also cannot undo
-- the past, and the application says so rather than implying a recall.

CREATE OR REPLACE FUNCTION app.prevent_guide_move() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  -- Identity stays fixed. A guide that changed workspace would take its
  -- releases, audit trail and inbound links with it.
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
    RAISE EXCEPTION 'Guide identity is immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

-- The names of everything that would stop this guide being public. Empty means
-- the move is allowed. The service asks before offering the choice, so an
-- author reads the reason instead of discovering it by being refused.
CREATE FUNCTION app.guide_public_blockers(w text, g text)
RETURNS TABLE(kind text, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  WITH guide AS (
    SELECT id, workspace_id, state, current_release
    FROM app.guide WHERE workspace_id = w AND id = g
  ), workspace_blocker AS (
    SELECT 'workspace'::text AS kind, s.name
    FROM app.workspace s JOIN guide ON true
    WHERE s.id = w AND s.audience <> 'public'
  ), release_category AS (
    SELECT r.category_id
    FROM app.release r JOIN guide ON guide.id = r.guide_id
    WHERE r.workspace_id = w AND r.number = guide.current_release AND guide.state = 'published'
  ), ancestors AS (
    WITH RECURSIVE walk AS (
      SELECT c.id, c.parent_id, c.name, c.visibility
      FROM app.category c JOIN release_category rc ON rc.category_id = c.id
      WHERE c.workspace_id = w
      UNION ALL
      SELECT p.id, p.parent_id, p.name, p.visibility
      FROM app.category p JOIN walk ON p.id = walk.parent_id
      WHERE p.workspace_id = w
    )
    SELECT 'category'::text AS kind, name FROM walk WHERE visibility <> 'public'
  ), items AS (
    SELECT DISTINCT 'item'::text AS kind, i.name
    FROM app.guide_requirement_reference ref
    JOIN guide ON guide.id = ref.guide_id
    JOIN app.catalog_item i ON i.workspace_id = ref.workspace_id AND i.id = ref.item_id
    WHERE ref.workspace_id = w
      AND ref.release_number = guide.current_release
      AND guide.state = 'published'
      AND i.visibility <> 'public'
  )
  SELECT * FROM workspace_blocker
  UNION ALL SELECT * FROM ancestors
  UNION ALL SELECT * FROM items
$$;

-- The same rule, enforced where it cannot be skipped. The listing above is for
-- explaining; this is for being correct.
CREATE FUNCTION app.check_guide_audience() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE blocked text;
BEGIN
  IF NEW.audience IS NOT DISTINCT FROM OLD.audience THEN RETURN NEW; END IF;
  -- Withdrawing from the public section exposes nothing new.
  IF NEW.audience = 'members' THEN RETURN NEW; END IF;

  SELECT string_agg(name, ', ') INTO blocked
  FROM app.guide_public_blockers(NEW.workspace_id, NEW.id) WHERE kind = 'workspace';
  IF blocked IS NOT NULL THEN
    RAISE EXCEPTION 'This workspace is private, so it has no public section' USING ERRCODE = '23514';
  END IF;

  SELECT string_agg(name, ', ') INTO blocked
  FROM app.guide_public_blockers(NEW.workspace_id, NEW.id) WHERE kind = 'category';
  IF blocked IS NOT NULL THEN
    RAISE EXCEPTION
      'This guide is published under a members-only category (%). Make that category public, or move the guide and publish again.', blocked
      USING ERRCODE = '23514';
  END IF;

  SELECT string_agg(name, ', ') INTO blocked
  FROM app.guide_public_blockers(NEW.workspace_id, NEW.id) WHERE kind = 'item';
  IF blocked IS NOT NULL THEN
    RAISE EXCEPTION
      'The published version uses members-only catalog items (%). Make those public, or replace them and publish again.', blocked
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guide_audience_integrity
  BEFORE UPDATE OF audience ON app.guide
  FOR EACH ROW EXECUTE FUNCTION app.check_guide_audience();

REVOKE ALL ON FUNCTION app.guide_public_blockers(text, text), app.check_guide_audience() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.guide_public_blockers(text, text) TO guide_runtime;
