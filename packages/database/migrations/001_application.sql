REVOKE CREATE ON SCHEMA public FROM PUBLIC;
CREATE TABLE IF NOT EXISTS public.auth_user (
 id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE,
 email_verified boolean NOT NULL DEFAULT false, image text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), active boolean NOT NULL DEFAULT true
);
CREATE TABLE IF NOT EXISTS public.auth_session (
 id text PRIMARY KEY, expires_at timestamptz NOT NULL, token text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), ip_address text, user_agent text,
 user_id text NOT NULL REFERENCES public.auth_user(id) ON DELETE CASCADE
);
CREATE INDEX auth_session_user ON public.auth_session(user_id);
CREATE TABLE IF NOT EXISTS public.auth_account (
 id text PRIMARY KEY, account_id text NOT NULL, provider_id text NOT NULL,
 user_id text NOT NULL REFERENCES public.auth_user(id) ON DELETE CASCADE,
 access_token text, refresh_token text, id_token text, access_token_expires_at timestamptz, refresh_token_expires_at timestamptz, scope text, password text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_account_user ON public.auth_account(user_id);
CREATE TABLE IF NOT EXISTS public.auth_verification (
 id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE SCHEMA app;
CREATE TABLE app.workspace(id text PRIMARY KEY,name text NOT NULL,audience text NOT NULL CHECK(audience IN('public','private')));
CREATE TABLE app.membership(workspace_id text REFERENCES app.workspace(id),actor_id text REFERENCES public.auth_user(id),role text NOT NULL CHECK(role IN('owner','reader','author','admin','contributor')),active boolean NOT NULL DEFAULT true,PRIMARY KEY(workspace_id,actor_id));
CREATE TABLE app.guide(
 id text PRIMARY KEY,workspace_id text NOT NULL REFERENCES app.workspace(id),audience text NOT NULL CHECK(audience IN('public','members')),
 state text NOT NULL DEFAULT 'draft' CHECK(state IN('draft','published','withdrawn','redacted')),
 document jsonb NOT NULL,category text NOT NULL,version integer NOT NULL DEFAULT 1 CHECK(version>0),current_release integer,published_version integer,
 artwork text NOT NULL DEFAULT 'bench',author text NOT NULL, is_sample boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id)
);
CREATE TABLE app.release(
 guide_id text NOT NULL,workspace_id text NOT NULL,number integer NOT NULL CHECK(number>0),draft_version integer NOT NULL,
 document jsonb NOT NULL,category text NOT NULL,license text NOT NULL CHECK(license IN('all-rights-reserved','CC-BY-4.0','CC-BY-SA-4.0','local-preview-only')),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(guide_id,number),FOREIGN KEY(workspace_id,guide_id) REFERENCES app.guide(workspace_id,id)
);
CREATE TABLE app.audit(id text PRIMARY KEY,workspace_id text NOT NULL REFERENCES app.workspace(id),guide_id text NOT NULL REFERENCES app.guide(id),actor_id text NOT NULL REFERENCES public.auth_user(id),action text NOT NULL,details jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE app.outbox(id text PRIMARY KEY,workspace_id text NOT NULL REFERENCES app.workspace(id),guide_id text NOT NULL REFERENCES app.guide(id),event text NOT NULL,payload jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE app.rate_limit(key text PRIMARY KEY,count integer NOT NULL,expires_at timestamptz NOT NULL);
CREATE INDEX rate_limit_expiration ON app.rate_limit(expires_at);
CREATE FUNCTION app.actor_id() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('guide.actor_id',true),'') $$;
CREATE FUNCTION app.actor_allowed() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(current_setting('guide.actor_active',true),'')='true' AND (app.actor_id() IS NULL OR EXISTS(SELECT 1 FROM public.auth_user u WHERE u.id=app.actor_id() AND u.active AND u.email_verified))
$$;
CREATE FUNCTION app.member_role(w text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT m.role FROM app.membership m WHERE m.workspace_id=w AND m.actor_id=app.actor_id() AND m.active AND app.actor_allowed()
$$;
CREATE FUNCTION app.workspace_readable(w text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT app.actor_allowed() AND EXISTS(SELECT 1 FROM app.workspace s WHERE s.id=w AND (s.audience='public' OR app.member_role(w) IS NOT NULL))
$$;
CREATE FUNCTION app.release_readable(w text,g text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT app.actor_allowed() AND EXISTS(SELECT 1 FROM app.guide d JOIN app.workspace s ON s.id=d.workspace_id WHERE d.id=g AND d.workspace_id=w AND d.state='published' AND ((s.audience='public' AND d.audience='public') OR app.member_role(w) IS NOT NULL))
$$;
CREATE FUNCTION app.prevent_guide_move() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.audience IS DISTINCT FROM OLD.audience THEN RAISE EXCEPTION 'Guide identity and audience are immutable' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER immutable_guide_scope BEFORE UPDATE ON app.guide FOR EACH ROW EXECUTE FUNCTION app.prevent_guide_move();
ALTER TABLE app.workspace ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.membership ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.guide ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.release ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY workspace_read ON app.workspace FOR SELECT USING(app.workspace_readable(id));
CREATE POLICY membership_read ON app.membership FOR SELECT USING(actor_id=app.actor_id() AND app.actor_allowed());
CREATE POLICY draft_read ON app.guide FOR SELECT USING(app.member_role(workspace_id)='owner');
CREATE POLICY draft_insert ON app.guide FOR INSERT WITH CHECK(app.member_role(workspace_id)='owner' AND (audience='members' OR EXISTS(SELECT 1 FROM app.workspace WHERE id=workspace_id AND audience='public')));
CREATE POLICY draft_update ON app.guide FOR UPDATE USING(app.member_role(workspace_id)='owner') WITH CHECK(app.member_role(workspace_id)='owner');
CREATE POLICY release_read ON app.release FOR SELECT USING(app.release_readable(workspace_id,guide_id) OR app.member_role(workspace_id)='owner');
CREATE POLICY release_insert ON app.release FOR INSERT WITH CHECK(app.member_role(workspace_id)='owner');
CREATE POLICY audit_read ON app.audit FOR SELECT USING(app.member_role(workspace_id)='owner');
CREATE POLICY audit_insert ON app.audit FOR INSERT WITH CHECK(app.member_role(workspace_id)='owner' AND actor_id=app.actor_id());
CREATE POLICY outbox_read ON app.outbox FOR SELECT USING(app.member_role(workspace_id)='owner');
CREATE POLICY outbox_insert ON app.outbox FOR INSERT WITH CHECK(app.member_role(workspace_id)='owner');
-- Public reader projection is a security-barrier function: drafts remain unselectable.
CREATE FUNCTION app.published_guides(w text) RETURNS TABLE(id text,workspace_id text,audience text,artwork text,author text,is_sample boolean,document jsonb,category text,license text,release integer,updated_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT g.id,g.workspace_id,g.audience,g.artwork,g.author,g.is_sample,r.document,r.category,r.license,r.number,r.created_at
 FROM app.guide g JOIN app.release r ON r.guide_id=g.id AND r.number=g.current_release
 WHERE g.workspace_id=w AND app.release_readable(g.workspace_id,g.id)
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO guide_runtime;
GRANT EXECUTE ON FUNCTION app.actor_id(),app.actor_allowed(),app.member_role(text),app.workspace_readable(text),app.release_readable(text,text),app.published_guides(text) TO guide_runtime;
GRANT SELECT ON app.workspace,app.membership TO guide_runtime;
GRANT SELECT,INSERT,UPDATE ON app.guide TO guide_runtime;
GRANT SELECT,INSERT ON app.release,app.audit,app.outbox TO guide_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON app.rate_limit TO guide_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.auth_user,public.auth_session,public.auth_account,public.auth_verification TO guide_runtime;
CREATE FUNCTION app.lock_scope(w text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM 1 FROM public.auth_user WHERE id=app.actor_id() FOR SHARE;
 PERFORM 1 FROM app.workspace WHERE id=w FOR SHARE;
 PERFORM 1 FROM app.membership WHERE workspace_id=w AND actor_id=app.actor_id() FOR SHARE;
END $$;
REVOKE ALL ON FUNCTION app.lock_scope(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.lock_scope(text) TO guide_runtime;
