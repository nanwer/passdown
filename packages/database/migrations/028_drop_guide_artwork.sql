-- A guide no longer names an illustration.
--
-- app.guide.artwork has defaulted to 'bench' since migration 001 and nothing in
-- the product has ever written it; only the local sample seed did. Once guides
-- could carry a cover (025), a card chose the cover, then the first step
-- picture, then the picture of the thing it is filed under, and only then this
-- column — so for anything a person wrote it could only ever say 'bench'. A
-- guide with no picture at all now shows a neutral placeholder, and the sample
-- guides take their drawings from the sample content itself, where the choice
-- was actually made.
--
-- Written from the live definitions of both functions, not from the files that
-- last created them. They are the only objects that read the column; the other
-- dependency is its own default.
--
-- A returns-table signature cannot be replaced in place, so each function is
-- dropped and recreated, and its grants are restored in the same step.

DROP FUNCTION app.published_guides(text);
CREATE FUNCTION app.published_guides(w text)
 RETURNS TABLE(id text, workspace_id text, audience text, author text,
   is_sample boolean, document jsonb, category text, license text, release integer,
   updated_at timestamp with time zone, category_id text, category_path jsonb,
   cover_asset_id text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
 SELECT g.id,g.workspace_id,g.audience,r.author,r.is_sample,r.document,c.name,
        r.license,r.number,r.created_at,r.category_id,app.category_path(w,r.category_id),
        r.cover_asset_id
 FROM app.guide g JOIN app.release r ON r.guide_id=g.id AND r.number=g.current_release
 JOIN app.category c ON c.id=r.category_id
 WHERE g.workspace_id=w AND app.release_readable(g.workspace_id,g.id)
   AND app.category_readable(w,r.category_id)
$function$;

REVOKE ALL ON FUNCTION app.published_guides(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.published_guides(text) TO guide_runtime;

DROP FUNCTION app.published_guide_page(text, text, text, text, text, integer, integer);
CREATE FUNCTION app.published_guide_page(w text, a text, cat text, cat_id text, q text,
  lim integer, off integer)
 RETURNS TABLE(id text, workspace_id text, audience text, author text,
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
  SELECT g.id, g.workspace_id, g.audience, r.author, r.is_sample, r.document,
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

ALTER TABLE app.guide DROP COLUMN artwork;
