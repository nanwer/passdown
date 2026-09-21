-- Two permissions, named for what they let you do.
--
-- app.membership has permitted five roles since the first migration — owner,
-- reader, author, admin and contributor — and the database has never
-- distinguished four of them. Every one of the nineteen policies and two
-- functions that consulted a role compared it to 'owner' and nothing else. The
-- live data agrees: every membership that has ever existed is an owner.
--
-- So this is a rename and a deletion rather than a new system. What was
-- 'owner' becomes 'manage'. What was any other role becomes 'view', which is
-- what those memberships already were in practice: the predicates that ask
-- "is this actor a member at all" have always been the definition of view, and
-- they are left exactly as they are.
--
-- The comparison moves into one function. Every policy now asks
-- app.member_manages rather than comparing text to a literal, so the next time
-- this vocabulary changes it is one line and not twenty-one places to miss one.

CREATE FUNCTION app.member_manages(w text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT app.member_role(w) = 'manage'
$$;
REVOKE ALL ON FUNCTION app.member_manages(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.member_manages(text) TO guide_runtime;

-- Existing memberships. The old constraint has to go first: it still lists the
-- five words this migration exists to replace, so it rejects the new ones.
ALTER TABLE app.membership DROP CONSTRAINT membership_role_check;
UPDATE app.membership SET role = CASE WHEN role = 'owner' THEN 'manage' ELSE 'view' END;
ALTER TABLE app.membership ADD CONSTRAINT membership_role_check CHECK (role IN ('manage','view'));

-- The nineteen policies and two functions, rewritten. These were generated from
-- the live catalog rather than from the migration files, which is how the third
-- argument overload of category_guide_counts was caught: grepping the SQL on
-- disk finds the definition that was written, not the one that is installed.
DROP POLICY asset_insert ON app.asset;
CREATE POLICY asset_insert ON app.asset FOR INSERT WITH CHECK((app.in_scope(workspace_id) AND app.member_manages(workspace_id)));
DROP POLICY asset_read ON app.asset;
CREATE POLICY asset_read ON app.asset FOR SELECT USING((app.asset_readable(workspace_id, id) OR (app.in_scope(workspace_id) AND app.member_manages(workspace_id))));
DROP POLICY asset_reference_owner ON app.asset_reference;
CREATE POLICY asset_reference_owner ON app.asset_reference FOR ALL USING((app.in_scope(workspace_id) AND app.member_manages(workspace_id))) WITH CHECK((app.in_scope(workspace_id) AND app.member_manages(workspace_id)));
DROP POLICY audit_insert ON app.audit;
CREATE POLICY audit_insert ON app.audit FOR INSERT WITH CHECK((app.member_manages(workspace_id) AND (actor_id = app.actor_id())));
DROP POLICY audit_read ON app.audit;
CREATE POLICY audit_read ON app.audit FOR SELECT USING(app.member_manages(workspace_id));
DROP POLICY catalog_insert ON app.catalog_item;
CREATE POLICY catalog_insert ON app.catalog_item FOR INSERT WITH CHECK((app.in_scope(workspace_id) AND app.member_manages(workspace_id)));
DROP POLICY catalog_update ON app.catalog_item;
CREATE POLICY catalog_update ON app.catalog_item FOR UPDATE USING((app.in_scope(workspace_id) AND app.member_manages(workspace_id))) WITH CHECK((app.in_scope(workspace_id) AND app.member_manages(workspace_id)));
DROP POLICY catalog_version_read ON app.catalog_item_version;
CREATE POLICY catalog_version_read ON app.catalog_item_version FOR SELECT USING((app.in_scope(workspace_id) AND app.member_manages(workspace_id)));
DROP POLICY category_insert ON app.category;
CREATE POLICY category_insert ON app.category FOR INSERT WITH CHECK((app.in_scope(workspace_id) AND app.member_manages(workspace_id)));
DROP POLICY category_update ON app.category;
CREATE POLICY category_update ON app.category FOR UPDATE USING((app.in_scope(workspace_id) AND app.member_manages(workspace_id))) WITH CHECK((app.in_scope(workspace_id) AND app.member_manages(workspace_id)));
DROP POLICY draft_insert ON app.guide;
CREATE POLICY draft_insert ON app.guide FOR INSERT WITH CHECK((app.member_manages(workspace_id) AND ((audience = 'members'::text) OR (EXISTS ( SELECT 1
   FROM app.workspace
  WHERE ((workspace.id = guide.workspace_id) AND (workspace.audience = 'public'::text)))))));
DROP POLICY draft_read ON app.guide;
CREATE POLICY draft_read ON app.guide FOR SELECT USING((app.member_manages(workspace_id) AND (state = ANY (ARRAY['draft'::text, 'published'::text]))));
DROP POLICY draft_update ON app.guide;
CREATE POLICY draft_update ON app.guide FOR UPDATE USING((app.member_manages(workspace_id) AND (state = ANY (ARRAY['draft'::text, 'published'::text])))) WITH CHECK((app.member_manages(workspace_id) AND (state = ANY (ARRAY['draft'::text, 'published'::text]))));
DROP POLICY guide_family_owner ON app.guide_family;
CREATE POLICY guide_family_owner ON app.guide_family FOR ALL USING((app.in_scope(workspace_id) AND app.member_manages(workspace_id))) WITH CHECK((app.in_scope(workspace_id) AND app.member_manages(workspace_id)));
DROP POLICY requirement_ref_owner ON app.guide_requirement_reference;
CREATE POLICY requirement_ref_owner ON app.guide_requirement_reference FOR ALL USING((app.in_scope(workspace_id) AND app.member_manages(workspace_id))) WITH CHECK((app.in_scope(workspace_id) AND app.member_manages(workspace_id)));
DROP POLICY guide_type_write ON app.guide_type;
CREATE POLICY guide_type_write ON app.guide_type FOR ALL USING((app.in_scope(workspace_id) AND app.member_manages(workspace_id))) WITH CHECK((app.in_scope(workspace_id) AND app.member_manages(workspace_id)));
DROP POLICY outbox_insert ON app.outbox;
CREATE POLICY outbox_insert ON app.outbox FOR INSERT WITH CHECK(app.member_manages(workspace_id));
DROP POLICY outbox_read ON app.outbox;
CREATE POLICY outbox_read ON app.outbox FOR SELECT USING(app.member_manages(workspace_id));
DROP POLICY release_insert ON app.release;
CREATE POLICY release_insert ON app.release FOR INSERT WITH CHECK(app.member_manages(workspace_id));

CREATE OR REPLACE FUNCTION app.asset_readable(w text, a text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  SELECT app.in_scope(w) AND app.actor_allowed() AND (
    EXISTS(
      SELECT 1
      FROM app.asset_reference ref
      JOIN app.guide g ON g.workspace_id = ref.workspace_id AND g.id = ref.guide_id
      WHERE ref.workspace_id = w
        AND ref.asset_id = a
        AND g.state NOT IN ('redacted', 'withdrawn')
        AND (
          (ref.release_number = 0 AND app.member_manages(w))
          OR (ref.release_number = g.current_release AND app.release_readable(w, g.id))
        )
    )
    OR EXISTS(
      SELECT 1 FROM app.category c
      WHERE c.workspace_id = w AND c.image_asset_id = a AND app.category_readable(w, c.id)
    )
  )
$function$;

CREATE OR REPLACE FUNCTION app.category_guide_counts(w text, d text, a text)
 RETURNS TABLE(category_id text, direct bigint, subtree bigint, published_direct bigint, published_subtree bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
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
      AND app.member_manages(w)
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
$function$;
