-- An item stops declaring what it is.
--
-- The previous change moved the distinction onto a guide's reference to an
-- item: keep it, or use it up. That left app.catalog_item.kind reading to
-- nobody, while the catalog form still opened by asking which of tool,
-- material or part an item permanently was — the question with no answer that
-- the whole change exists to remove.
--
-- Two constraints hang off it and go with it. The unit rule — a tool is
-- counted in each or pair — now belongs to the role, because it is a fact
-- about keeping something rather than about the thing itself, and that check
-- lives in the document schema. The identity index included kind, which meant
-- the same manufacturer and part number could be registered twice as long as
-- someone called one a material and the other a part. A part number identifies
-- a thing; it does not identify a thing-plus-an-opinion.

ALTER TABLE app.catalog_item DROP CONSTRAINT catalog_item_check;
ALTER TABLE app.catalog_item DROP CONSTRAINT catalog_item_kind_check;

DROP INDEX app.catalog_identifier;
CREATE UNIQUE INDEX catalog_identifier ON app.catalog_item(
  workspace_id, app.normalized_name(manufacturer), app.normalized_name(part_number)
) WHERE trim(manufacturer) <> '' AND trim(part_number) <> '';

-- Identity and workspace stay fixed; kind is no longer among them because it
-- no longer exists.
CREATE OR REPLACE FUNCTION app.check_catalog_item() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.workspace_id, 719821007));
  IF TG_OP = 'UPDATE' AND (NEW.id <> OLD.id OR NEW.workspace_id <> OLD.workspace_id) THEN
    RAISE EXCEPTION 'Item identity and workspace cannot change' USING ERRCODE = '23514';
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

ALTER TABLE app.catalog_item DROP COLUMN kind;
