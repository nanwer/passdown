-- Inviting somebody, without a mail server.
--
-- Invitations must work without an email service. Creating a usable link is
-- independent of delivery, so the inviter can pass it to the intended person
-- without configuring SMTP or relying on a delivery confirmation.
--
-- So the link is the delivery mechanism. It is shown once, to the person who
-- created it, to pass on however they like. Email can be layered on later as a
-- convenience without changing any of this.

CREATE TABLE app.invitation (
  workspace_id text NOT NULL REFERENCES app.workspace(id) ON DELETE CASCADE,
  id text NOT NULL,
  email text NOT NULL,
  role text NOT NULL CHECK (role IN ('manage','view')),

  -- The token is never stored. What is kept is a SHA-256 of it, so a copy of
  -- this table is not a set of working invitations.
  --
  -- Keep the secret independent of the invitation's identifier. Lookup hashes
  -- the supplied token, so a database copy does not expose the original link.
  token_hash text NOT NULL,

  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  invited_by text NOT NULL REFERENCES public.auth_user(id),

  -- Single use. Record acceptance and reject subsequent uses of the link.
  accepted_at timestamptz,
  accepted_by text REFERENCES public.auth_user(id),

  PRIMARY KEY (workspace_id, id),
  CONSTRAINT invitation_accepted_together
    CHECK ((accepted_at IS NULL) = (accepted_by IS NULL)),
  CONSTRAINT invitation_email_present CHECK (btrim(email) <> '')
);

-- A token identifies one invitation across the whole installation.
CREATE UNIQUE INDEX invitation_token ON app.invitation(token_hash);

-- One live invitation per address per workspace, so re-inviting somebody
-- cannot quietly leave two working links with different permissions on them.
CREATE UNIQUE INDEX invitation_pending_email
  ON app.invitation(workspace_id, app.normalized_name(email))
  WHERE accepted_at IS NULL;

ALTER TABLE app.invitation ENABLE ROW LEVEL SECURITY;
CREATE POLICY invitation_manage ON app.invitation
  FOR ALL USING(app.in_scope(workspace_id) AND app.member_manages(workspace_id))
  WITH CHECK(app.in_scope(workspace_id) AND app.member_manages(workspace_id));
GRANT SELECT,INSERT,UPDATE,DELETE ON app.invitation TO guide_runtime;

-- Managers can see who is in their workspace.
--
-- Until now app.membership showed you your own row and nothing else, which is
-- all the product needed when the only member was the person who installed it.
-- A screen listing people cannot be built on that.
CREATE POLICY membership_read_workspace ON app.membership
  FOR SELECT USING(app.in_scope(workspace_id) AND app.member_manages(workspace_id));
CREATE POLICY membership_write ON app.membership
  FOR UPDATE USING(app.in_scope(workspace_id) AND app.member_manages(workspace_id))
  WITH CHECK(app.in_scope(workspace_id) AND app.member_manages(workspace_id));
CREATE POLICY membership_remove ON app.membership
  FOR DELETE USING(app.in_scope(workspace_id) AND app.member_manages(workspace_id));
GRANT UPDATE,DELETE ON app.membership TO guide_runtime;

-- A workspace cannot be left with nobody who can administer it.
--
-- Enforced here rather than in the application because it is the one rule that
-- cannot be recovered from through the product: a workspace with no manager
-- has no one who can appoint another, and no screen anywhere would let you fix
-- it. The check counts the state after the statement, so it catches the last
-- manager demoting themselves as well as removing themselves.
CREATE FUNCTION app.check_last_manager() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  target text := COALESCE(OLD.workspace_id, NEW.workspace_id);
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM app.membership
    WHERE workspace_id = target AND role = 'manage' AND active
  ) THEN
    RAISE EXCEPTION
      'A workspace must keep at least one person who can manage it'
      USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END $$;

CREATE CONSTRAINT TRIGGER membership_keeps_a_manager
  AFTER UPDATE OR DELETE ON app.membership
  DEFERRABLE INITIALLY IMMEDIATE
  FOR EACH ROW EXECUTE FUNCTION app.check_last_manager();

-- Accepting an invitation, by somebody who is not yet a member of anything.
--
-- The person redeeming a link has no membership, so no policy on app.membership
-- can admit them and they cannot insert their own row. This runs as the owner
-- and is the only way in: it checks the token, the expiry and that the
-- invitation has not already been used, and it is given the hash rather than
-- the token so the raw secret never reaches the database at all.
-- The parameter is not called actor_id: inside the INSERT below that name
-- also refers to the column, and plpgsql rejects the statement as ambiguous
-- rather than guessing.
CREATE FUNCTION app.accept_invitation(hash text, who text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
  invite app.invitation%ROWTYPE;
BEGIN
  SELECT * INTO invite FROM app.invitation
  WHERE token_hash = hash AND accepted_at IS NULL AND expires_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  INSERT INTO app.membership(workspace_id, actor_id, role)
  VALUES (invite.workspace_id, who, invite.role)
  ON CONFLICT (workspace_id, actor_id) DO UPDATE SET role = EXCLUDED.role, active = true;
  UPDATE app.invitation
  SET accepted_at = now(), accepted_by = who
  WHERE workspace_id = invite.workspace_id AND id = invite.id;
  RETURN invite.workspace_id;
END $$;

-- What the person holding a link is told before they accept it.
--
-- They have no account yet, so no policy on app.invitation can show them
-- anything. This returns the little that page needs and nothing that would help
-- someone guessing: an invalid, expired or already-used token returns no rows
-- rather than saying which of the three it was.
CREATE FUNCTION app.describe_invitation(hash text)
RETURNS TABLE(workspace_id text, workspace_name text, email text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT i.workspace_id, w.name, i.email, i.role
  FROM app.invitation i
  JOIN app.workspace w ON w.id = i.workspace_id
  WHERE i.token_hash = hash AND i.accepted_at IS NULL AND i.expires_at > now()
$$;

REVOKE ALL ON FUNCTION app.check_last_manager(), app.accept_invitation(text, text),
  app.describe_invitation(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.accept_invitation(text, text) TO guide_runtime;
GRANT EXECUTE ON FUNCTION app.describe_invitation(text) TO guide_runtime;
