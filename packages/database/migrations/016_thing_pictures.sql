-- A picture for each thing, so the tree can be browsed by recognition.
--
-- A picture helps readers distinguish similar models in a deep tree. Include
-- the picture reference with each child so a browsable grid does not need a
-- separate metadata request for every item.
--
-- The interesting part is authorisation. An asset has until now been readable
-- only through a live reference from a guide — app.asset_reference — and a
-- thing's picture has no guide. So app.asset_readable gains a second way in,
-- and it has to be exactly as tight as the first: a members-only thing's
-- picture must stay invisible to a visitor, in the same way a members-only
-- guide's pictures already do.

ALTER TABLE app.category ADD COLUMN image_asset_id text;
ALTER TABLE app.category
  ADD CONSTRAINT category_image_scope
  FOREIGN KEY (workspace_id, image_asset_id) REFERENCES app.asset(workspace_id, id);

-- Readable through a guide, as before, or as the picture of a thing the reader
-- may already see.
--
-- app.category_readable carries the whole rule for the second case: it is false
-- for an anonymous visitor when the thing, or anything above it, is
-- members-only. Deferring to it rather than restating the condition is what
-- keeps the two from drifting apart later.
CREATE OR REPLACE FUNCTION app.asset_readable(w text, a text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT app.in_scope(w) AND app.actor_allowed() AND (
    EXISTS(
      SELECT 1
      FROM app.asset_reference ref
      JOIN app.guide g ON g.workspace_id = ref.workspace_id AND g.id = ref.guide_id
      WHERE ref.workspace_id = w
        AND ref.asset_id = a
        AND g.state NOT IN ('redacted', 'withdrawn')
        AND (
          (ref.release_number = 0 AND app.member_role(w) = 'owner')
          OR (ref.release_number = g.current_release AND app.release_readable(w, g.id))
        )
    )
    OR EXISTS(
      SELECT 1 FROM app.category c
      WHERE c.workspace_id = w AND c.image_asset_id = a AND app.category_readable(w, c.id)
    )
  )
$$;
