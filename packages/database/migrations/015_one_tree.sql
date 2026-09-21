-- One tree, not three.
--
-- app.category carried three parallel hierarchies — one for guides, one for
-- tools, one for materials — distinguished by a `domain` column and all called
-- "categories" on screen. Two of them have never held a row, in any workspace,
-- since the day they shipped. The guide tree has eleven, all top-level.
--
-- iFixit runs 48,455 nodes through a single tree with one object type at every
-- depth, and projects parts onto it rather than maintaining a second hierarchy
-- for them. That reuse is the highest-leverage decision in their architecture:
-- one tree, and the store, the forum and the troubleshooting pages all key off
-- it. Three trees bought us nothing and cost a screen that asked which of them
-- you meant before it asked anything else.
--
-- So the tool and material trees go, and a catalog item stops belonging to a
-- tree at all. What is left is a flat, searchable list of items with a kind and
-- a visibility — which is all either has ever been used as.

-- 1. An item no longer sits in a hierarchy.
--
--    `domain` on an item existed only to feed this foreign key; it was
--    generated from `kind` so that a tool had to be filed in the tool tree and
--    anything else in the material tree. With no second tree to point at, both
--    the key and the column that served it are dead weight.
ALTER TABLE app.catalog_item
  DROP CONSTRAINT catalog_item_workspace_id_domain_category_id_fkey;
ALTER TABLE app.catalog_item DROP COLUMN domain;
ALTER TABLE app.catalog_item ALTER COLUMN category_id DROP NOT NULL;

-- 2. An item's visibility is its own.
--
--    Readability used to be inherited: an item was readable only if its
--    category was. With no category that predicate is false for every item, so
--    keeping it would hide the entire catalog. It was also the wrong rule —
--    whether a reader may see a part is a fact about the part, and the column
--    that says so has been there all along.
CREATE OR REPLACE FUNCTION app.catalog_readable(w text, i text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT app.in_scope(w) AND app.actor_allowed() AND EXISTS(
    SELECT 1 FROM app.catalog_item x
    WHERE x.workspace_id = w AND x.id = i
      AND (x.visibility = 'public' OR app.member_role(w) IS NOT NULL)
  )
$$;

-- 3. The integrity rules that referred to a category are gone; the rest stay.
--
--    Identity and kind are still fixed, and an item that a current public
--    release depends on still cannot be quietly restricted — that check is
--    what stops a published guide losing a part out from under its readers.
CREATE OR REPLACE FUNCTION app.check_catalog_item() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.workspace_id, 719821007));
  IF TG_OP = 'UPDATE' AND (
    NEW.id <> OLD.id OR NEW.workspace_id <> OLD.workspace_id OR NEW.kind <> OLD.kind
  ) THEN
    RAISE EXCEPTION 'Item identity, workspace and kind cannot change' USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.visibility = 'members' AND OLD.visibility = 'public' AND EXISTS(
    SELECT 1 FROM app.guide_requirement_reference ref
    JOIN app.guide g ON g.id = ref.guide_id
    WHERE ref.item_id = NEW.id AND ref.release_number = g.current_release
      AND g.state = 'published' AND g.audience = 'public'
  ) THEN
    RAISE EXCEPTION
      'A current public release uses this item; replace or withdraw those references before restricting it'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;

-- 4. Only one tree remains, and the database says so rather than trusting the
--    application to stop writing the other two.
--
--    The delete is a formality on every database this has been run against —
--    the tool and material trees are empty — but a constraint that assumes
--    something it has not checked is not a constraint.
DELETE FROM app.category WHERE domain <> 'guide';
ALTER TABLE app.category
  ADD CONSTRAINT category_guide_tree_only CHECK (domain = 'guide');
