-- How many guides use an item, counted once each.
--
-- The summary label read `Math.max(draftGuides, publishedGuides)`, which is the
-- larger of two counts rather than the size of their union. An item can sit in
-- guide A's published release after being taken out of A's draft, and also in
-- guide B's draft: one draft, one published, two distinct guides — labelled
-- "1 guide".
--
-- The union has to be computed where the rows are. Adding it here keeps the two
-- separate counts, which the detail view still shows, and gives the summary a
-- number that means what it says.

DROP FUNCTION app.catalog_usage_counts(text);
CREATE FUNCTION app.catalog_usage_counts(w text)
 RETURNS TABLE(item_id text, draft_guides bigint, published_guides bigint, distinct_guides bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  WITH readable AS (
    SELECT id FROM app.catalog_item
    WHERE workspace_id = w AND app.catalog_readable(w, id)
  ),
  usage AS (
    SELECT ref.item_id,
           count(DISTINCT ref.guide_id) FILTER (WHERE ref.release_number = 0) AS drafts,
           count(DISTINCT ref.guide_id) FILTER (WHERE ref.release_number = g.current_release) AS published,
           count(DISTINCT ref.guide_id) FILTER (
             WHERE ref.release_number = 0 OR ref.release_number = g.current_release
           ) AS distinct_guides
    FROM app.guide_requirement_reference ref
    JOIN app.guide g ON g.workspace_id = ref.workspace_id AND g.id = ref.guide_id
    WHERE ref.workspace_id = w
      AND g.state NOT IN ('redacted', 'withdrawn')
    GROUP BY ref.item_id
  )
  SELECT r.id,
         COALESCE((SELECT drafts FROM usage WHERE usage.item_id = r.id), 0),
         COALESCE((SELECT published FROM usage WHERE usage.item_id = r.id), 0),
         COALESCE((SELECT distinct_guides FROM usage WHERE usage.item_id = r.id), 0)
  FROM readable r
$function$;

REVOKE ALL ON FUNCTION app.catalog_usage_counts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.catalog_usage_counts(text) TO guide_runtime;
