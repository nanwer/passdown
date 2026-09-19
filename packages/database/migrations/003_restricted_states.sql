ALTER POLICY draft_read ON app.guide USING(app.member_role(workspace_id)='owner' AND state IN('draft','published'));
ALTER POLICY draft_update ON app.guide USING(app.member_role(workspace_id)='owner' AND state IN('draft','published')) WITH CHECK(app.member_role(workspace_id)='owner' AND state IN('draft','published'));
ALTER POLICY release_read ON app.release USING(app.release_readable(workspace_id,guide_id));
