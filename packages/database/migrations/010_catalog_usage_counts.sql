-- Distinct-guide usage counts for every readable catalog item.
--
-- app.get_catalog_usage already answers "which guides use this one item".
-- Listing every tool, part and material with its usage needed one query per
-- row, so this returns the whole workspace at once.
--
-- draft_guides     guides whose working draft references the item
-- published_guides guides whose CURRENT release references it
--
-- Each logical guide counts once per bucket, never once per requirement or per
-- release version. A guide can appear in both when its draft and its current
-- release both use the item.

CREATE FUNCTION app.catalog_usage_counts(w text)
RETURNS TABLE (item_id text, draft_guides bigint, published_guides bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  WITH readable AS (
    SELECT id FROM app.catalog_item
    WHERE workspace_id = w AND app.catalog_readable(w, id)
  ),
  usage AS (
    SELECT ref.item_id,
           count(DISTINCT ref.guide_id) FILTER (WHERE ref.release_number = 0) AS drafts,
           count(DISTINCT ref.guide_id) FILTER (WHERE ref.release_number = g.current_release) AS published
    FROM app.guide_requirement_reference ref
    JOIN app.guide g ON g.workspace_id = ref.workspace_id AND g.id = ref.guide_id
    WHERE ref.workspace_id = w
      AND g.state NOT IN ('redacted', 'withdrawn')
    GROUP BY ref.item_id
  )
  SELECT r.id,
         COALESCE((SELECT drafts FROM usage WHERE usage.item_id = r.id), 0),
         COALESCE((SELECT published FROM usage WHERE usage.item_id = r.id), 0)
  FROM readable r
$$;

REVOKE ALL ON FUNCTION app.catalog_usage_counts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.catalog_usage_counts(text) TO guide_runtime;
