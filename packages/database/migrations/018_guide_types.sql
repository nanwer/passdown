-- What kind of work a guide describes.
--
-- The thing tree has been answering two questions. In the workshop workspace
-- four guides out of five are filed under Inspection, Verification or Workshop
-- routines — none of which is a thing anyone owns — because there was nowhere
-- else to record what kind of work a procedure is. That is migration 015's
-- fault arriving from the other side: then three trees carried one axis, now
-- one tree carries two, and either way the tree means different things in
-- different rows and stops being browsable.
--
-- Work types form a small workspace-level vocabulary. Built-in definitions
-- make a new workspace usable, while operators can replace that vocabulary
-- when their procedures need different prompts or title templates.
--
-- Hence this table is an OVERRIDE, not a seeded copy. A workspace with no rows
-- gets the catalog the application ships, which is why this migration seeds
-- nothing: duplicating those seven rows in SQL would create two sources of the
-- same list and they would drift. Rows appear only once someone customises,
-- and then they are the whole truth for that workspace.

CREATE TABLE app.guide_type (
  workspace_id text NOT NULL REFERENCES app.workspace(id) ON DELETE CASCADE,
  key text NOT NULL,
  label text NOT NULL,
  description text NOT NULL DEFAULT '',
  prompt text NOT NULL DEFAULT '',
  title_template text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (workspace_id, key),

  -- The key is the referent: it is what a stored document, a URL and an export
  -- bind to, and it never changes. Constraining its shape here rather than only
  -- in the application keeps stored references stable when a label changes.
  CONSTRAINT guide_type_key_shape CHECK (key ~ '^[a-z][a-z0-9-]*$'),
  CONSTRAINT guide_type_label_present CHECK (btrim(label) <> ''),
  CONSTRAINT guide_type_template_present CHECK (btrim(title_template) <> ''),

  -- A template that substitutes an answer the type never asks for would compose
  -- a title with a hole in it.
  CONSTRAINT guide_type_template_answerable
    CHECK (btrim(prompt) <> '' OR strpos(title_template, '%subject') = 0)
);

-- Readable by anyone who may be in the workspace at all. A type list is
-- vocabulary rather than content — a reader of a public guide needs the label
-- for the key stored in that guide's document — so this follows the same shape
-- as app.catalog_readable and defers the real gate to workspace audience.
CREATE FUNCTION app.guide_type_readable(w text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT app.in_scope(w) AND app.actor_allowed() AND EXISTS(
    SELECT 1 FROM app.workspace x
    WHERE x.id = w AND (x.audience = 'public' OR app.member_role(w) IS NOT NULL)
  )
$$;

ALTER TABLE app.guide_type ENABLE ROW LEVEL SECURITY;
CREATE POLICY guide_type_read ON app.guide_type
  FOR SELECT USING(app.guide_type_readable(workspace_id));
CREATE POLICY guide_type_write ON app.guide_type
  FOR ALL USING(app.in_scope(workspace_id) AND app.member_role(workspace_id)='owner')
  WITH CHECK(app.in_scope(workspace_id) AND app.member_role(workspace_id)='owner');

-- Whether the create form offers a title composed from the type's template.
--
-- One workspace-level switch keeps title composition consistent across guides.
-- It defaults on so new guides benefit from the configured templates.
ALTER TABLE app.workspace ADD COLUMN compose_titles boolean NOT NULL DEFAULT true;

-- What kind of work this particular guide is, beside the document rather than
-- inside it.
--
-- This follows category_id exactly. "What is this about" has always been a
-- column on both the draft and the release snapshot, never a field in the
-- document JSON, and "what kind of work is this" is the same sort of fact about
-- the guide. Putting it here instead costs no document schema version, leaves
-- every stored document parsing unchanged, and keeps the two axes symmetrical.
--
-- subject is the answer to the type's prompt — the part being replaced, the
-- thing being checked. Worth storing rather than only substituting into the
-- title: it is the structured half of what the author typed.
--
-- No foreign key to app.guide_type, deliberately. That table is an override: a
-- workspace with no rows is using the catalog the application ships, so a key
-- can be entirely valid while no row exists for it. The shape is constrained
-- here and membership of the effective catalog is checked by the application.
ALTER TABLE app.guide ADD COLUMN guide_type_key text;
ALTER TABLE app.guide ADD COLUMN guide_type_subject text NOT NULL DEFAULT '';
ALTER TABLE app.release ADD COLUMN guide_type_key text;
ALTER TABLE app.release ADD COLUMN guide_type_subject text NOT NULL DEFAULT '';
ALTER TABLE app.guide ADD CONSTRAINT guide_type_key_shape
  CHECK (guide_type_key IS NULL OR guide_type_key ~ '^[a-z][a-z0-9-]*$');
ALTER TABLE app.release ADD CONSTRAINT release_type_key_shape
  CHECK (guide_type_key IS NULL OR guide_type_key ~ '^[a-z][a-z0-9-]*$');

-- A subject with no type to belong to is a stray answer to a question nobody
-- asked, and it would survive into the release snapshot looking meaningful.
ALTER TABLE app.guide ADD CONSTRAINT guide_type_subject_needs_type
  CHECK (guide_type_key IS NOT NULL OR guide_type_subject = '');
ALTER TABLE app.release ADD CONSTRAINT release_type_subject_needs_type
  CHECK (guide_type_key IS NOT NULL OR guide_type_subject = '');

REVOKE ALL ON FUNCTION app.guide_type_readable(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.guide_type_readable(text) TO guide_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON app.guide_type TO guide_runtime;
