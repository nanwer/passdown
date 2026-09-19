ALTER TABLE app.audit ADD CONSTRAINT audit_guide_scope FOREIGN KEY(workspace_id,guide_id) REFERENCES app.guide(workspace_id,id);
ALTER TABLE app.outbox ADD CONSTRAINT outbox_guide_scope FOREIGN KEY(workspace_id,guide_id) REFERENCES app.guide(workspace_id,id);
