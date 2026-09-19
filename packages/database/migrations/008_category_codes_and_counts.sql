-- Category short codes and authorized guide counts.
-- Additive: no existing column, constraint or release row is rewritten.

-- 1. Stable, non-recycled short code per category.
ALTER TABLE app.category ADD COLUMN code text;

-- Backfill deterministic codes for existing rows, numbered per workspace and domain.
-- Ordering is stable (creation-ish order via sort_order then id) so repeat runs agree.
WITH numbered AS (
  SELECT workspace_id, domain, id,
         row_number() OVER (PARTITION BY workspace_id, domain ORDER BY sort_order, id) AS n
  FROM app.category
)
UPDATE app.category c
SET code = CASE numbered.domain WHEN 'guide' THEN 'GC-' WHEN 'tool' THEN 'TC-' ELSE 'MC-' END
           || lpad(numbered.n::text, 4, '0')
FROM numbered
WHERE c.workspace_id = numbered.workspace_id AND c.id = numbered.id;

ALTER TABLE app.category ALTER COLUMN code SET NOT NULL;
ALTER TABLE app.category ADD CONSTRAINT category_code_shape
  CHECK (code ~ '^[A-Z0-9][A-Z0-9-]{0,23}$');
CREATE UNIQUE INDEX category_code_unique
  ON app.category (workspace_id, domain, code);

-- 2. Next available code for a domain, used to propose a value at creation time
--    and to fill one in when a caller does not supply its own.
CREATE FUNCTION app.next_category_code(w text, d text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT CASE d WHEN 'guide' THEN 'GC-' WHEN 'tool' THEN 'TC-' ELSE 'MC-' END
         || lpad((
              COALESCE(MAX(NULLIF(regexp_replace(code, '^[A-Z]+-', ''), '')::bigint), 0) + 1
            )::text, 4, '0')
  FROM app.category
  WHERE workspace_id = w AND domain = d
    AND code ~ '^[A-Z]+-[0-9]+$'
$$;

-- 3. Assign a code when none is given, and keep it immutable once assigned.
--    Assigning in the database keeps direct inserts and fixtures working, and
--    guarantees the non-recycled property regardless of the calling path.
CREATE FUNCTION app.check_category_code() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.code IS NULL OR trim(NEW.code) = '' THEN
      -- serialize code assignment per workspace so concurrent creates cannot collide
      PERFORM pg_advisory_xact_lock(hashtextextended(NEW.workspace_id, 719821008));
      NEW.code := app.next_category_code(NEW.workspace_id, NEW.domain);
    ELSE
      NEW.code := upper(trim(NEW.code));
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.code <> OLD.code THEN
    RAISE EXCEPTION 'Category code cannot change once assigned' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER category_code_assign
  BEFORE INSERT OR UPDATE ON app.category
  FOR EACH ROW EXECUTE FUNCTION app.check_category_code();

-- 4. Authorized distinct-guide counts per category.
--    direct  = guides whose own category is this category
--    subtree = direct plus every readable descendant category
--    Counts each logical guide once: never steps, requirements or release versions.
--    published_* mirror the same shape for guides whose CURRENT release sits here,
--    which is what blocks deactivation.
CREATE FUNCTION app.category_guide_counts(w text, d text)
RETURNS TABLE (
  category_id text,
  direct bigint,
  subtree bigint,
  published_direct bigint,
  published_subtree bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  WITH RECURSIVE visible AS (
    SELECT id, parent_id
    FROM app.category
    WHERE workspace_id = w AND domain = d AND app.category_readable(w, id)
  ),
  -- every (ancestor, descendant) pair, including the category itself
  closure AS (
    SELECT id AS ancestor, id AS descendant FROM visible
    UNION ALL
    SELECT c.ancestor, v.id
    FROM closure c
    JOIN visible v ON v.parent_id = c.descendant
  ),
  draft AS (
    SELECT g.category_id AS cid, count(DISTINCT g.id) AS n
    FROM app.guide g
    WHERE g.workspace_id = w
      AND g.category_id IS NOT NULL
      AND g.state NOT IN ('redacted', 'withdrawn')
      AND app.category_readable(w, g.category_id)
    GROUP BY g.category_id
  ),
  published AS (
    SELECT r.category_id AS cid, count(DISTINCT r.guide_id) AS n
    FROM app.release r
    JOIN app.guide g ON g.workspace_id = r.workspace_id AND g.id = r.guide_id
    WHERE r.workspace_id = w
      AND r.category_id IS NOT NULL
      AND r.number = g.current_release
      AND g.state NOT IN ('redacted', 'withdrawn')
      AND app.category_readable(w, r.category_id)
    GROUP BY r.category_id
  )
  SELECT v.id,
         COALESCE((SELECT n FROM draft WHERE cid = v.id), 0),
         COALESCE((SELECT sum(n) FROM closure cl JOIN draft ON draft.cid = cl.descendant
                   WHERE cl.ancestor = v.id), 0),
         COALESCE((SELECT n FROM published WHERE cid = v.id), 0),
         COALESCE((SELECT sum(n) FROM closure cl JOIN published ON published.cid = cl.descendant
                   WHERE cl.ancestor = v.id), 0)
  FROM visible v
$$;

REVOKE ALL ON FUNCTION
  app.check_category_code(),
  app.next_category_code(text, text),
  app.category_guide_counts(text, text)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  app.next_category_code(text, text),
  app.category_guide_counts(text, text)
TO guide_runtime;
