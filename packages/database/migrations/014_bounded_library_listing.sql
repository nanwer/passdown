-- A library page that costs the same whether a workspace holds ten guides or
-- ten thousand.
--
-- The reader's listing was app.published_guides(w) with no WHERE and no LIMIT:
-- every current release in the workspace, each carrying its complete document,
-- handed to the application so it could filter and count in JavaScript. One
-- keystroke in the search field read the whole library. The work grew with the
-- collection, which is exactly the direction it must not grow.
--
-- Filtering belongs here, where the rows are. These functions answer the two
-- questions a library page actually asks — "how many guides match?" and "give
-- me this page of them" — and only the page carries documents.
--
-- Authorization is unchanged and not re-derived: every function below starts
-- from app.release_readable and app.category_readable, the same predicates the
-- existing projection uses. The audience argument narrows an already authorized
-- set into one section; it can never widen it, because it is applied after
-- those predicates and only ever removes rows.

-- 1. The text a search actually looks at, computed once when a release is
--    written rather than on every keystroke.
--
--    Title and summary only: a reader searching for "brake" wants guides about
--    brakes, not every guide filed under a category whose name contains the
--    word. Normalizing here is what makes fullwidth "Ｓａｖｅｄ" find "Saved" —
--    the same app.normalized_name the taxonomy uses for its identities, so the
--    two agree about what counts as the same text.
--
--    Stored, not an expression index: reading a narrow text column avoids
--    detoasting a document per row, which is most of what made the old listing
--    expensive.
ALTER TABLE app.release ADD COLUMN search_text text
  GENERATED ALWAYS AS (
    app.normalized_name(
      coalesce(document ->> 'title', '') || ' ' || coalesce(document ->> 'summary', '')
    )
  ) STORED;

-- The two shapes the library reads in: most recent first across a workspace,
-- and everything filed under one category.
CREATE INDEX release_workspace_recent ON app.release(workspace_id, created_at DESC, guide_id);
CREATE INDEX release_workspace_category ON app.release(workspace_id, category_id);

-- 2. A category and everything below it. Browsing "Bicycles" shows guides filed
--    under its branches too, which is the containment the application used to
--    express by searching each guide's category path.
CREATE FUNCTION app.category_subtree(w text, c text) RETURNS TABLE(id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  WITH RECURSIVE walk AS (
    SELECT c1.id FROM app.category c1 WHERE c1.workspace_id = w AND c1.id = c
    UNION ALL
    SELECT c2.id FROM app.category c2 JOIN walk ON c2.parent_id = walk.id
    WHERE c2.workspace_id = w
  )
  SELECT id FROM walk
$$;

-- 3. Which current releases this actor may read and this filter selects, as
--    identities and ordering keys alone. Both the count and the page are built
--    from it, so they can never disagree about what matches.
--
--    A NULL argument means "do not filter on this", which keeps one predicate
--    for every combination the library offers.
CREATE FUNCTION app.published_guide_matches(w text, a text, cat text, cat_id text, q text)
RETURNS TABLE(id text, updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT g.id, r.created_at
  FROM app.guide g
  JOIN app.release r ON r.guide_id = g.id AND r.number = g.current_release
  JOIN app.category c ON c.id = r.category_id
  WHERE g.workspace_id = w
    AND app.release_readable(g.workspace_id, g.id)
    AND app.category_readable(w, r.category_id)
    -- Narrowing only: the reader is already authorized for everything above.
    AND (a IS NULL OR g.audience = a)
    AND (cat IS NULL OR c.name = cat)
    AND (cat_id IS NULL OR r.category_id IN (SELECT s.id FROM app.category_subtree(w, cat_id) s))
    AND (q IS NULL OR strpos(r.search_text, app.normalized_name(q)) > 0)
$$;

-- 4. How many guides match, so a bounded page can say what it is a page of
--    instead of silently ending.
CREATE FUNCTION app.published_guide_total(w text, a text, cat text, cat_id text, q text)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT count(*) FROM app.published_guide_matches(w, a, cat, cat_id, q)
$$;

-- 5. One page of matches, newest first. Ordering and the limit are applied to
--    the identities before any document is fetched, so a page costs what a page
--    costs however large the library is.
CREATE FUNCTION app.published_guide_page(
  w text, a text, cat text, cat_id text, q text, lim integer, off integer
)
RETURNS TABLE(
  id text, workspace_id text, audience text, artwork text, author text, is_sample boolean,
  document jsonb, category text, license text, release integer, updated_at timestamptz,
  category_id text, category_path jsonb
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  WITH page AS (
    SELECT m.id, m.updated_at
    FROM app.published_guide_matches(w, a, cat, cat_id, q) m
    ORDER BY m.updated_at DESC, m.id
    LIMIT lim OFFSET off
  )
  SELECT g.id, g.workspace_id, g.audience, g.artwork, r.author, r.is_sample, r.document,
         c.name, r.license, r.number, r.created_at, r.category_id,
         app.category_path(w, r.category_id)
  FROM page p
  JOIN app.guide g ON g.workspace_id = w AND g.id = p.id
  JOIN app.release r ON r.guide_id = g.id AND r.number = g.current_release
  JOIN app.category c ON c.id = r.category_id
  ORDER BY p.updated_at DESC, p.id
$$;

-- 6. Category totals for the browse cards, which the application used to derive
--    by reading every guide it could see.
--
--    app.category_guide_counts(w, d) answers this for the studio, where the
--    caller owns the workspace and sees both sections at once. A reader is a
--    different question: a visitor must not learn from a total that a
--    members-only guide exists, and the internal section must count its own
--    guides rather than the public ones alongside them. This overload adds the
--    section argument and counts only what the caller may actually open —
--    drafts for an owner, readable current releases for everyone.
CREATE FUNCTION app.category_guide_counts(w text, d text, a text)
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
      AND app.member_role(w) = 'owner'
      AND g.state NOT IN ('redacted', 'withdrawn')
      AND app.category_readable(w, g.category_id)
      AND (a IS NULL OR g.audience = a)
    GROUP BY g.category_id
  ),
  published AS (
    SELECT r.category_id AS cid, count(DISTINCT r.guide_id) AS n
    FROM app.release r
    JOIN app.guide g ON g.workspace_id = r.workspace_id AND g.id = r.guide_id
    WHERE r.workspace_id = w
      AND r.number = g.current_release
      AND app.release_readable(r.workspace_id, r.guide_id)
      AND app.category_readable(w, r.category_id)
      AND (a IS NULL OR g.audience = a)
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
  app.category_subtree(text, text),
  app.published_guide_matches(text, text, text, text, text),
  app.published_guide_total(text, text, text, text, text),
  app.published_guide_page(text, text, text, text, text, integer, integer),
  app.category_guide_counts(text, text, text)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  app.category_subtree(text, text),
  app.published_guide_matches(text, text, text, text, text),
  app.published_guide_total(text, text, text, text, text),
  app.published_guide_page(text, text, text, text, text, integer, integer),
  app.category_guide_counts(text, text, text)
TO guide_runtime;
