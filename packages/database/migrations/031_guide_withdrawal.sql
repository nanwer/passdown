-- Withdrawing a published guide, and a revision for who-can-read-what.
--
-- Every reader-side check already refuses state 'withdrawn'. What was missing
-- is the other side: the draft policies admitted only draft and published, so
-- a withdrawn guide would have vanished from its managers. And nothing
-- identified a publication state: publish, withdraw and reinstate each carried
-- only a release number, which can mean the same thing twice (withdrawn,
-- reinstated, withdrawn again). publication_revision changes whenever state,
-- current release or audience changes, and only the database changes it.

ALTER POLICY draft_read ON app.guide
  USING (app.member_manages(workspace_id) AND state IN ('draft', 'published', 'withdrawn'));
ALTER POLICY draft_update ON app.guide
  USING (app.member_manages(workspace_id) AND state IN ('draft', 'published', 'withdrawn'))
  WITH CHECK (app.member_manages(workspace_id) AND state IN ('draft', 'published', 'withdrawn'));

ALTER TABLE app.guide ADD COLUMN publication_revision integer NOT NULL DEFAULT 0;
ALTER TABLE app.guide ADD CONSTRAINT guide_publication_revision_nonnegative
  CHECK (publication_revision >= 0);
-- NOT VALID: no row could have been withdrawn before this migration; new rows are checked.
ALTER TABLE app.guide ADD CONSTRAINT guide_withdrawn_has_release
  CHECK (state <> 'withdrawn' OR current_release IS NOT NULL) NOT VALID;

-- What would stop the withdrawn release being readable again. Internal:
-- used by the state trigger for every writer, owner included. Not granted.
CREATE FUNCTION app.reinstate_blockers(w text, g text)
RETURNS TABLE(kind text, name text, reason text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  WITH guide AS (
    SELECT d.id, d.audience, d.current_release
    FROM app.guide d
    WHERE d.workspace_id = w AND d.id = g AND d.current_release IS NOT NULL
  ), rel AS (
    SELECT r.category_id
    FROM app.release r JOIN guide ON r.guide_id = guide.id AND r.number = guide.current_release
    WHERE r.workspace_id = w
  ), workspace_blocker AS (
    SELECT 'workspace'::text AS kind, s.name, 'private-workspace'::text AS reason
    FROM app.workspace s JOIN guide ON guide.audience = 'public'
    WHERE s.id = w AND s.audience <> 'public'
  ), inactive_category AS (
    SELECT 'category'::text AS kind, c.name, 'inactive'::text AS reason
    FROM app.category c JOIN rel ON rel.category_id = c.id
    WHERE c.workspace_id = w AND c.archived
  ), restricted_category AS (
    WITH RECURSIVE walk AS (
      SELECT c.id, c.parent_id, c.name, c.visibility
      FROM app.category c JOIN rel ON rel.category_id = c.id
      WHERE c.workspace_id = w
      UNION ALL
      SELECT p.id, p.parent_id, p.name, p.visibility
      FROM app.category p JOIN walk ON p.id = walk.parent_id
      WHERE p.workspace_id = w
    )
    SELECT 'category'::text AS kind, walk.name, 'members-only'::text AS reason
    FROM walk JOIN guide ON guide.audience = 'public'
    WHERE walk.visibility <> 'public'
  ), restricted_item AS (
    SELECT DISTINCT 'item'::text AS kind, i.name, 'members-only'::text AS reason
    FROM app.guide_requirement_reference ref
    JOIN guide ON guide.id = ref.guide_id AND ref.release_number = guide.current_release
    JOIN app.catalog_item i ON i.workspace_id = ref.workspace_id AND i.id = ref.item_id
    WHERE ref.workspace_id = w AND guide.audience = 'public' AND i.visibility <> 'public'
  )
  SELECT * FROM workspace_blocker
  UNION ALL SELECT * FROM inactive_category
  UNION ALL SELECT * FROM restricted_category
  UNION ALL SELECT * FROM restricted_item
$$;

-- The same list for a manager's screen. NULL from member_manages (not a
-- member, suspended, unverified) is a refusal, not a pass.
CREATE FUNCTION app.guide_reinstate_blockers(w text, g text)
RETURNS TABLE(kind text, name text, reason text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF (app.in_scope(w) AND app.member_manages(w)) IS NOT TRUE THEN
    RAISE EXCEPTION 'Not permitted' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT b.kind, b.name, b.reason FROM app.reinstate_blockers(w, g) b;
END $$;

-- Publication state: revision and transitions, for every writer.
CREATE FUNCTION app.guide_publication_state() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE blocked text;
BEGIN
  IF NEW.publication_revision IS DISTINCT FROM OLD.publication_revision THEN
    RAISE EXCEPTION 'The publication revision is kept by the database.' USING ERRCODE = '42501';
  END IF;
  IF NEW.state IS NOT DISTINCT FROM OLD.state
     AND NEW.current_release IS NOT DISTINCT FROM OLD.current_release
     AND NEW.audience IS NOT DISTINCT FROM OLD.audience THEN
    RETURN NEW;
  END IF;
  NEW.publication_revision := OLD.publication_revision + 1;
  IF NEW.state IS DISTINCT FROM OLD.state THEN
    IF NEW.state = 'withdrawn' AND OLD.state IS DISTINCT FROM 'published' THEN
      RAISE EXCEPTION 'Only a published guide can be withdrawn.' USING ERRCODE = '23514';
    END IF;
    IF OLD.state = 'withdrawn' AND NEW.state = 'draft' THEN
      RAISE EXCEPTION 'A withdrawn guide comes back by being reinstated or published again.'
        USING ERRCODE = '23514';
    END IF;
    -- Reinstating: same release, readable again, so it meets today's rules.
    IF OLD.state = 'withdrawn' AND NEW.state = 'published'
       AND NEW.current_release IS NOT DISTINCT FROM OLD.current_release THEN
      SELECT string_agg(b.name, ', ' ORDER BY b.name) INTO blocked
      FROM app.reinstate_blockers(NEW.workspace_id, NEW.id) b;
      IF blocked IS NOT NULL THEN
        RAISE EXCEPTION 'This release cannot be reinstated because of %. Publish from the draft instead.', blocked
          USING ERRCODE = '23514';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER guide_publication_state
  BEFORE UPDATE ON app.guide
  FOR EACH ROW EXECUTE FUNCTION app.guide_publication_state();

-- No section moves while withdrawn. Live definition from 013, plus one rule.
CREATE OR REPLACE FUNCTION app.check_guide_audience() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE blocked text;
BEGIN
  IF NEW.audience IS NOT DISTINCT FROM OLD.audience THEN RETURN NEW; END IF;
  IF OLD.state = 'withdrawn' THEN
    RAISE EXCEPTION 'Reinstate or publish the guide first, then move it between sections.'
      USING ERRCODE = '23514';
  END IF;
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

-- Who is told a guide was withdrawn: exactly who release_readable admitted
-- while it was published. Always true or false, never NULL.
CREATE FUNCTION app.withdrawn_notice_visible(w text, g text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT coalesce(app.in_scope(w) AND app.actor_allowed() AND EXISTS(
    SELECT 1 FROM app.guide d JOIN app.workspace s ON s.id = d.workspace_id
    WHERE d.id = g AND d.workspace_id = w AND d.state = 'withdrawn'
      AND ((s.audience = 'public' AND d.audience = 'public') OR app.member_role(w) IS NOT NULL)
  ), false)
$$;

REVOKE ALL ON FUNCTION app.reinstate_blockers(text, text), app.guide_reinstate_blockers(text, text),
  app.guide_publication_state(), app.withdrawn_notice_visible(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.guide_reinstate_blockers(text, text),
  app.withdrawn_notice_visible(text, text) TO guide_runtime;
