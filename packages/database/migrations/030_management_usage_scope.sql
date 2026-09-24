-- An item's visibility does not make the drafts which use it readable. Count
-- private drafts only for managers and published references only when that
-- release is readable. Apply this to legacy pickers as well as paged tables.
CREATE OR REPLACE FUNCTION app.catalog_usage_counts(w text)
 RETURNS TABLE(item_id text, draft_guides bigint, published_guides bigint, distinct_guides bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  WITH readable AS (
    SELECT id FROM app.catalog_item
    WHERE workspace_id=w AND app.catalog_readable(w,id)
  ), usage AS (
    SELECT ref.item_id,
      count(DISTINCT ref.guide_id) FILTER(WHERE ref.release_number=0) AS drafts,
      count(DISTINCT ref.guide_id) FILTER(WHERE ref.release_number=g.current_release) AS published,
      count(DISTINCT ref.guide_id) AS distinct_guides
    FROM app.guide_requirement_reference ref
    JOIN app.guide g ON g.workspace_id=ref.workspace_id AND g.id=ref.guide_id
    WHERE ref.workspace_id=w AND g.state NOT IN ('redacted','withdrawn')
      AND ((ref.release_number=0 AND app.member_manages(w))
        OR (ref.release_number=g.current_release AND app.release_readable(w,g.id)))
    GROUP BY ref.item_id
  )
  SELECT r.id,coalesce(u.drafts,0),coalesce(u.published,0),coalesce(u.distinct_guides,0)
  FROM readable r LEFT JOIN usage u ON u.item_id=r.id
$$;
REVOKE ALL ON FUNCTION app.catalog_usage_counts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.catalog_usage_counts(text) TO guide_runtime;

CREATE OR REPLACE FUNCTION app.category_guide_counts(w text,d text)
 RETURNS TABLE(category_id text,direct bigint,subtree bigint,published_direct bigint,published_subtree bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT * FROM app.category_guide_counts(w,d,NULL)
$$;
REVOKE ALL ON FUNCTION app.category_guide_counts(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.category_guide_counts(text,text) TO guide_runtime;
