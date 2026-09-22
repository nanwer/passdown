-- A guide can have a picture of its own.
--
-- The library drew every card from app.guide.artwork, a column with a default
-- of 'bench' and nothing anywhere that writes to it, so a real library was one
-- illustration repeated. The card now falls back to the first picture on a step
-- and then to the picture of the thing the guide is about, which helps — but
-- neither is a choice anybody made. A guide's cover is a decision about how the
-- guide is presented, and it belongs to the guide.
--
-- A column rather than a document field, for the same reason category_id and
-- guide_type_key are columns: it is metadata about the guide, not part of the
-- instructions, and putting it in the document would cost a schema version and
-- every call site that parses one.
--
-- It is on the release as well as the guide, because a release is a fixed
-- snapshot of how a guide was published. Changing the cover on the draft must
-- not change the cover on what people are already reading.

ALTER TABLE app.guide ADD COLUMN cover_asset_id text;
ALTER TABLE app.release ADD COLUMN cover_asset_id text;

-- Pointing at a picture in another workspace is not a thing to leave possible.
ALTER TABLE app.guide
  ADD CONSTRAINT guide_cover_in_workspace
  FOREIGN KEY (workspace_id, cover_asset_id) REFERENCES app.asset(workspace_id, id) ON DELETE SET NULL;

-- A returns-table signature cannot be replaced in place, so it is dropped and
-- recreated, which takes its grants with it.
DROP FUNCTION app.published_guides(text);
CREATE FUNCTION app.published_guides(w text)
 RETURNS TABLE(id text, workspace_id text, audience text, artwork text, author text,
   is_sample boolean, document jsonb, category text, license text, release integer,
   updated_at timestamp with time zone, category_id text, category_path jsonb,
   cover_asset_id text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
 SELECT g.id,g.workspace_id,g.audience,g.artwork,r.author,r.is_sample,r.document,c.name,
        r.license,r.number,r.created_at,r.category_id,app.category_path(w,r.category_id),
        r.cover_asset_id
 FROM app.guide g JOIN app.release r ON r.guide_id=g.id AND r.number=g.current_release
 JOIN app.category c ON c.id=r.category_id
 WHERE g.workspace_id=w AND app.release_readable(g.workspace_id,g.id)
   AND app.category_readable(w,r.category_id)
$function$;

REVOKE ALL ON FUNCTION app.published_guides(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.published_guides(text) TO guide_runtime;

-- The library reads its page through published_guide_page, not through
-- published_guides. Extending only the one whose name matched the concept left
-- the cover invisible in exactly the place it exists for.
DROP FUNCTION app.published_guide_page(text, text, text, text, text, integer, integer);
CREATE FUNCTION app.published_guide_page(w text, a text, cat text, cat_id text, q text,
  lim integer, off integer)
 RETURNS TABLE(id text, workspace_id text, audience text, artwork text, author text,
   is_sample boolean, document jsonb, category text, license text, release integer,
   updated_at timestamp with time zone, category_id text, category_path jsonb,
   cover_asset_id text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  WITH page AS (
    SELECT m.id, m.updated_at
    FROM app.published_guide_matches(w, a, cat, cat_id, q) m
    ORDER BY m.updated_at DESC, m.id
    LIMIT lim OFFSET off
  )
  SELECT g.id, g.workspace_id, g.audience, g.artwork, r.author, r.is_sample, r.document,
         c.name, r.license, r.number, r.created_at, r.category_id,
         app.category_path(w, r.category_id), r.cover_asset_id
  FROM page p
  JOIN app.guide g ON g.workspace_id = w AND g.id = p.id
  JOIN app.release r ON r.guide_id = g.id AND r.number = g.current_release
  JOIN app.category c ON c.id = r.category_id
  ORDER BY p.updated_at DESC, p.id
$function$;

REVOKE ALL ON FUNCTION app.published_guide_page(text, text, text, text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.published_guide_page(text, text, text, text, text, integer, integer) TO guide_runtime;
