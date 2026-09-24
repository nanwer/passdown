-- Management ordering treats digit runs as numbers, so Item 2 precedes Item 10.
-- Arrays avoid fixed-width numeric padding and preserve arbitrarily long part
-- numbers without casting user text to a database numeric type.
CREATE FUNCTION app.management_sort_key(value text) RETURNS text[]
LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog AS $$
  SELECT coalesce(array_agg(
    CASE WHEN part[1] ~ '^[0-9]+$'
      THEN '0' || lpad(length(coalesce(nullif(ltrim(part[1],'0'),''),'0'))::text,4,'0')
        || coalesce(nullif(ltrim(part[1],'0'),''),'0')
      ELSE '1' || part[1]
    END ORDER BY ordinal
  ), ARRAY[]::text[])
  FROM regexp_matches(app.normalized_name(value),'([0-9]+|[^0-9]+)','g') WITH ORDINALITY AS chunks(part,ordinal)
$$;
REVOKE ALL ON FUNCTION app.management_sort_key(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.management_sort_key(text) TO guide_runtime;
