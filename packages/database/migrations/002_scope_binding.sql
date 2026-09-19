CREATE FUNCTION app.in_scope(w text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('guide.workspace_id',true),'')=w $$;
REVOKE ALL ON FUNCTION app.in_scope(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.in_scope(text) TO guide_runtime;
CREATE POLICY guide_scope ON app.guide AS RESTRICTIVE FOR ALL USING(app.in_scope(workspace_id)) WITH CHECK(app.in_scope(workspace_id));
CREATE POLICY release_scope ON app.release AS RESTRICTIVE FOR ALL USING(app.in_scope(workspace_id)) WITH CHECK(app.in_scope(workspace_id));
CREATE POLICY audit_scope ON app.audit AS RESTRICTIVE FOR ALL USING(app.in_scope(workspace_id)) WITH CHECK(app.in_scope(workspace_id));
CREATE POLICY outbox_scope ON app.outbox AS RESTRICTIVE FOR ALL USING(app.in_scope(workspace_id)) WITH CHECK(app.in_scope(workspace_id));
CREATE OR REPLACE FUNCTION app.release_readable(w text,g text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT app.in_scope(w) AND app.actor_allowed() AND EXISTS(SELECT 1 FROM app.guide d JOIN app.workspace s ON s.id=d.workspace_id WHERE d.id=g AND d.workspace_id=w AND d.state='published' AND ((s.audience='public' AND d.audience='public') OR app.member_role(w) IS NOT NULL))
$$;
