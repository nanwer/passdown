-- Uploaded images.
--
-- An asset record describes bytes that have already been re-encoded and
-- stripped of camera metadata. The row is immutable: replacing an image
-- creates a new asset, so a published release can never have its pictures
-- changed underneath it.
--
-- Readability is decided by a live reference, never by possession of an
-- identifier. app.asset_reference records which guide and which release use an
-- asset, exactly as app.guide_requirement_reference does for catalog items, so
-- withdrawing a release also withdraws access to its pictures.

CREATE TABLE app.asset(
  id text PRIMARY KEY,
  workspace_id text NOT NULL REFERENCES app.workspace(id),
  content_hash text NOT NULL CHECK(content_hash ~ '^[0-9a-f]{64}$'),
  media_type text NOT NULL CHECK(media_type IN('image/jpeg','image/png','image/webp')),
  byte_size bigint NOT NULL CHECK(byte_size > 0 AND byte_size <= 20971520),
  width integer NOT NULL CHECK(width > 0 AND width <= 20000),
  height integer NOT NULL CHECK(height > 0 AND height <= 20000),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, id)
);

CREATE TABLE app.asset_reference(
  workspace_id text NOT NULL,
  asset_id text NOT NULL,
  guide_id text NOT NULL,
  -- 0 is the working draft; any other number is that published release.
  release_number integer NOT NULL DEFAULT 0 CHECK(release_number >= 0),
  PRIMARY KEY(workspace_id, asset_id, guide_id, release_number),
  FOREIGN KEY(workspace_id, asset_id) REFERENCES app.asset(workspace_id, id),
  FOREIGN KEY(workspace_id, guide_id) REFERENCES app.guide(workspace_id, id)
);
CREATE INDEX asset_reference_guide ON app.asset_reference(workspace_id, guide_id, release_number);

-- An asset is readable only through a reference the actor may already read:
-- the owner's working draft, or a guide's current release. A superseded or
-- withdrawn release stops granting access without deleting anything.
CREATE FUNCTION app.asset_readable(w text, a text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT app.in_scope(w) AND app.actor_allowed() AND EXISTS(
    SELECT 1
    FROM app.asset_reference ref
    JOIN app.guide g ON g.workspace_id = ref.workspace_id AND g.id = ref.guide_id
    WHERE ref.workspace_id = w
      AND ref.asset_id = a
      AND g.state NOT IN ('redacted', 'withdrawn')
      AND (
        (ref.release_number = 0 AND app.member_role(w) = 'owner')
        OR (ref.release_number = g.current_release AND app.release_readable(w, g.id))
      )
  )
$$;

ALTER TABLE app.asset ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.asset_reference ENABLE ROW LEVEL SECURITY;

-- An owner may see every asset in their own workspace, including one not yet
-- referenced by any step: an upload exists before the save that uses it.
CREATE POLICY asset_read ON app.asset FOR SELECT
  USING(app.asset_readable(workspace_id, id)
        OR (app.in_scope(workspace_id) AND app.member_role(workspace_id) = 'owner'));
CREATE POLICY asset_insert ON app.asset FOR INSERT
  WITH CHECK(app.in_scope(workspace_id) AND app.member_role(workspace_id) = 'owner');
CREATE POLICY asset_reference_owner ON app.asset_reference FOR ALL
  USING(app.in_scope(workspace_id) AND app.member_role(workspace_id) = 'owner')
  WITH CHECK(app.in_scope(workspace_id) AND app.member_role(workspace_id) = 'owner');

REVOKE ALL ON FUNCTION app.asset_readable(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.asset_readable(text, text) TO guide_runtime;
GRANT SELECT, INSERT ON app.asset TO guide_runtime;
GRANT SELECT, INSERT, DELETE ON app.asset_reference TO guide_runtime;
