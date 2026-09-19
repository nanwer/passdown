ALTER TABLE app.release ADD COLUMN author text, ADD COLUMN is_sample boolean;
UPDATE app.release r SET author=g.author,is_sample=(r.license='local-preview-only') FROM app.guide g WHERE g.id=r.guide_id;
ALTER TABLE app.release ALTER COLUMN author SET NOT NULL, ALTER COLUMN is_sample SET NOT NULL;
CREATE OR REPLACE FUNCTION app.published_guides(w text) RETURNS TABLE(id text,workspace_id text,audience text,artwork text,author text,is_sample boolean,document jsonb,category text,license text,release integer,updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT g.id,g.workspace_id,g.audience,g.artwork,r.author,r.is_sample,r.document,r.category,r.license,r.number,r.created_at
 FROM app.guide g JOIN app.release r ON r.guide_id=g.id AND r.number=g.current_release
 WHERE g.workspace_id=w AND app.release_readable(g.workspace_id,g.id)
$$;
