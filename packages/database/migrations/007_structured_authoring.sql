-- Stable taxonomy identities; old document JSON is intentionally left untouched.
CREATE FUNCTION app.normalized_name(value text) RETURNS text LANGUAGE sql IMMUTABLE STRICT AS $$
 SELECT lower(regexp_replace(trim(normalize(value,NFKC)), '\s+', ' ', 'g'))
$$;
CREATE TABLE app.category(
 id text PRIMARY KEY,workspace_id text NOT NULL REFERENCES app.workspace(id),domain text NOT NULL CHECK(domain IN('guide','tool','material')),
 parent_id text,name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),description text NOT NULL DEFAULT '',visibility text NOT NULL CHECK(visibility IN('public','members')),
 archived boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1 CHECK(version>0),sort_order integer NOT NULL DEFAULT 0,
 UNIQUE(workspace_id,id),UNIQUE(workspace_id,domain,id),
 FOREIGN KEY(workspace_id,domain,parent_id) REFERENCES app.category(workspace_id,domain,id)
);
CREATE UNIQUE INDEX category_sibling_name ON app.category(workspace_id,domain,coalesce(parent_id,''),app.normalized_name(name));
CREATE TABLE app.catalog_item(
 id text PRIMARY KEY,workspace_id text NOT NULL REFERENCES app.workspace(id),category_id text NOT NULL,kind text NOT NULL CHECK(kind IN('tool','material','part')),
 domain text GENERATED ALWAYS AS(CASE WHEN kind='tool' THEN 'tool' ELSE 'material' END) STORED,
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 160),specification text NOT NULL DEFAULT '',description text NOT NULL DEFAULT '',
 manufacturer text NOT NULL DEFAULT '',model text NOT NULL DEFAULT '',part_number text NOT NULL DEFAULT '',
 default_unit text NOT NULL CHECK(default_unit IN('each','pair','g','kg','ml','l','mm','cm','m')),
 visibility text NOT NULL CHECK(visibility IN('public','members')),archived boolean NOT NULL DEFAULT false,version integer NOT NULL DEFAULT 1 CHECK(version>0),
 CHECK(kind<>'tool' OR default_unit IN('each','pair')),UNIQUE(workspace_id,id),FOREIGN KEY(workspace_id,domain,category_id) REFERENCES app.category(workspace_id,domain,id)
);
CREATE UNIQUE INDEX catalog_identifier ON app.catalog_item(workspace_id,kind,app.normalized_name(manufacturer),app.normalized_name(part_number)) WHERE trim(manufacturer)<>'' AND trim(part_number)<>'';
CREATE TABLE app.catalog_item_version(
 workspace_id text NOT NULL,item_id text NOT NULL,version integer NOT NULL,snapshot jsonb NOT NULL,
 PRIMARY KEY(workspace_id,item_id,version),FOREIGN KEY(workspace_id,item_id) REFERENCES app.catalog_item(workspace_id,id)
);
CREATE TABLE app.guide_requirement_reference(
 workspace_id text NOT NULL,guide_id text NOT NULL,release_number integer NOT NULL DEFAULT 0 CHECK(release_number>=0),requirement_id text NOT NULL,item_id text NOT NULL,item_version integer NOT NULL,
 PRIMARY KEY(workspace_id,guide_id,release_number,requirement_id),
 FOREIGN KEY(workspace_id,guide_id) REFERENCES app.guide(workspace_id,id),FOREIGN KEY(workspace_id,item_id,item_version) REFERENCES app.catalog_item_version(workspace_id,item_id,version)
);
ALTER TABLE app.guide ADD COLUMN category_id text;
ALTER TABLE app.release ADD COLUMN category_id text,ADD COLUMN category_path jsonb;
WITH labels AS (
 SELECT g.workspace_id,g.category,false AS public FROM app.guide g
 UNION ALL
 SELECT r.workspace_id,r.category,(w.audience='public' AND g.audience='public' AND g.state='published' AND g.current_release=r.number) FROM app.release r JOIN app.guide g ON g.id=r.guide_id JOIN app.workspace w ON w.id=r.workspace_id
), grouped AS (
 SELECT workspace_id,app.normalized_name(category) AS normalized,min(category) AS name,bool_or(public) AS public FROM labels GROUP BY workspace_id,app.normalized_name(category)
)
INSERT INTO app.category(id,workspace_id,domain,name,visibility)
 SELECT gen_random_uuid()::text,workspace_id,'guide',name,CASE WHEN public THEN 'public' ELSE 'members' END FROM grouped;
UPDATE app.guide g SET category_id=c.id FROM app.category c WHERE c.workspace_id=g.workspace_id AND c.domain='guide' AND app.normalized_name(c.name)=app.normalized_name(g.category);
UPDATE app.release r SET category_id=c.id,category_path=jsonb_build_array(jsonb_build_object('id',c.id,'name',r.category)) FROM app.category c WHERE c.workspace_id=r.workspace_id AND c.domain='guide' AND app.normalized_name(c.name)=app.normalized_name(r.category);
ALTER TABLE app.guide ALTER COLUMN category_id SET NOT NULL,ADD CONSTRAINT guide_category_scope FOREIGN KEY(workspace_id,category_id) REFERENCES app.category(workspace_id,id);
ALTER TABLE app.release ALTER COLUMN category_id SET NOT NULL,ALTER COLUMN category_path SET NOT NULL,ADD CONSTRAINT release_category_scope FOREIGN KEY(workspace_id,category_id) REFERENCES app.category(workspace_id,id);
CREATE FUNCTION app.category_readable(w text,c text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH RECURSIVE ancestors AS (
 SELECT id,parent_id,visibility FROM app.category WHERE workspace_id=w AND id=c
 UNION ALL SELECT p.id,p.parent_id,p.visibility FROM app.category p JOIN ancestors a ON p.id=a.parent_id WHERE p.workspace_id=w
 )
 SELECT app.in_scope(w) AND app.actor_allowed() AND EXISTS(SELECT 1 FROM ancestors) AND (app.member_role(w) IS NOT NULL OR (EXISTS(SELECT 1 FROM app.workspace WHERE id=w AND audience='public') AND NOT EXISTS(SELECT 1 FROM ancestors WHERE visibility<>'public')))
$$;
CREATE FUNCTION app.category_path(w text,c text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 WITH RECURSIVE ancestors AS (
 SELECT id,parent_id,name,0 AS level FROM app.category WHERE workspace_id=w AND id=c AND app.category_readable(w,c)
 UNION ALL SELECT p.id,p.parent_id,p.name,a.level+1 FROM app.category p JOIN ancestors a ON p.id=a.parent_id WHERE p.workspace_id=w
 ) SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name) ORDER BY level DESC),'[]'::jsonb) FROM ancestors
$$;
CREATE FUNCTION app.catalog_readable(w text,i text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT app.in_scope(w) AND app.actor_allowed() AND EXISTS(SELECT 1 FROM app.catalog_item x WHERE x.workspace_id=w AND x.id=i AND app.category_readable(w,x.category_id) AND (x.visibility='public' OR app.member_role(w) IS NOT NULL))
$$;
CREATE FUNCTION app.check_category_tree() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE bad boolean; ancestor_depth integer; descendant_depth integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.workspace_id,719821007));
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.workspace_id<>OLD.workspace_id OR NEW.domain<>OLD.domain) THEN RAISE EXCEPTION 'Category identity and domain cannot change' USING ERRCODE='23514'; END IF;
 IF NEW.parent_id=NEW.id THEN RAISE EXCEPTION 'A category cannot be its own parent' USING ERRCODE='23514'; END IF;
 IF NEW.parent_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app.category WHERE id=NEW.parent_id AND workspace_id=NEW.workspace_id AND domain=NEW.domain AND NOT archived) THEN RAISE EXCEPTION 'Choose an active parent in this workspace and category tree' USING ERRCODE='23514'; END IF;
 WITH RECURSIVE ancestors AS (SELECT id,parent_id,visibility,1 depth FROM app.category WHERE id=NEW.parent_id AND workspace_id=NEW.workspace_id UNION ALL SELECT p.id,p.parent_id,p.visibility,a.depth+1 FROM app.category p JOIN ancestors a ON p.id=a.parent_id WHERE a.depth<=16)
 SELECT coalesce(bool_or(id=NEW.id),false),coalesce(max(depth),0) INTO bad,ancestor_depth FROM ancestors;
 IF bad THEN RAISE EXCEPTION 'A category cannot move below its own descendants' USING ERRCODE='23514'; END IF;
 WITH RECURSIVE descendants AS (SELECT id,0 depth FROM app.category WHERE id=NEW.id UNION ALL SELECT c.id,d.depth+1 FROM app.category c JOIN descendants d ON c.parent_id=d.id WHERE d.depth<=16) SELECT coalesce(max(depth),0) INTO descendant_depth FROM descendants;
 IF ancestor_depth+descendant_depth+1>16 THEN RAISE EXCEPTION 'Category trees support at most 16 levels' USING ERRCODE='23514'; END IF;
 IF NEW.visibility='public' AND (EXISTS(SELECT 1 FROM app.workspace WHERE id=NEW.workspace_id AND audience='private') OR EXISTS(SELECT 1 FROM app.category WHERE id=NEW.parent_id AND visibility='members')) THEN RAISE EXCEPTION 'Public categories require a public workspace and public parent' USING ERRCODE='23514'; END IF;
 IF NEW.archived AND (EXISTS(SELECT 1 FROM app.category WHERE parent_id=NEW.id AND NOT archived) OR EXISTS(SELECT 1 FROM app.guide WHERE category_id=NEW.id) OR EXISTS(SELECT 1 FROM app.release WHERE category_id=NEW.id) OR EXISTS(SELECT 1 FROM app.catalog_item WHERE category_id=NEW.id AND NOT archived)) THEN RAISE EXCEPTION 'Move child categories, assigned guides and active catalog items before archiving; historical category references are preserved' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND NEW.visibility='members' AND OLD.visibility='public' THEN
  IF EXISTS(SELECT 1 FROM app.category WHERE parent_id=NEW.id AND visibility='public') THEN RAISE EXCEPTION 'Restrict public child categories first' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM app.release r JOIN app.guide g ON g.id=r.guide_id AND g.current_release=r.number WHERE r.category_id=NEW.id AND g.audience='public' AND g.state='published') OR EXISTS(SELECT 1 FROM app.catalog_item WHERE category_id=NEW.id AND visibility='public') THEN RAISE EXCEPTION 'This category has public releases or catalog items; resolve those references before restricting visibility' USING ERRCODE='23514'; END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER category_tree_integrity BEFORE INSERT OR UPDATE ON app.category FOR EACH ROW EXECUTE FUNCTION app.check_category_tree();
CREATE FUNCTION app.check_catalog_item() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.workspace_id,719821007));
 IF TG_OP='UPDATE' AND (NEW.id<>OLD.id OR NEW.workspace_id<>OLD.workspace_id OR NEW.kind<>OLD.kind) THEN RAISE EXCEPTION 'Item identity, workspace and kind cannot change' USING ERRCODE='23514'; END IF;
 IF NOT EXISTS(SELECT 1 FROM app.category WHERE id=NEW.category_id AND workspace_id=NEW.workspace_id AND domain=CASE WHEN NEW.kind='tool' THEN 'tool' ELSE 'material' END AND NOT archived) THEN RAISE EXCEPTION 'Choose an active category for this item kind' USING ERRCODE='23514'; END IF;
 IF NEW.visibility='public' AND EXISTS(SELECT 1 FROM app.category WHERE id=NEW.category_id AND visibility<>'public') THEN RAISE EXCEPTION 'Public items require a public category' USING ERRCODE='23514'; END IF;
 IF TG_OP='UPDATE' AND NEW.visibility='members' AND OLD.visibility='public' AND EXISTS(SELECT 1 FROM app.guide_requirement_reference ref JOIN app.guide g ON g.id=ref.guide_id WHERE ref.item_id=NEW.id AND ref.release_number=g.current_release AND g.state='published' AND g.audience='public') THEN RAISE EXCEPTION 'A current public release uses this item; replace or withdraw those references before restricting it' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER catalog_integrity BEFORE INSERT OR UPDATE ON app.catalog_item FOR EACH ROW EXECUTE FUNCTION app.check_catalog_item();
CREATE FUNCTION app.snapshot_catalog_item() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN INSERT INTO app.catalog_item_version(workspace_id,item_id,version,snapshot) VALUES(NEW.workspace_id,NEW.id,NEW.version,to_jsonb(NEW)); RETURN NEW; END $$;
CREATE TRIGGER catalog_snapshot AFTER INSERT OR UPDATE ON app.catalog_item FOR EACH ROW EXECUTE FUNCTION app.snapshot_catalog_item();
CREATE FUNCTION app.check_guide_category() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.workspace_id,719821007));
 IF NOT EXISTS(SELECT 1 FROM app.category WHERE id=NEW.category_id AND workspace_id=NEW.workspace_id AND domain='guide' AND NOT archived) THEN RAISE EXCEPTION 'Choose an active guide category from this workspace' USING ERRCODE='23514'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guide_category_integrity BEFORE INSERT OR UPDATE OF category_id ON app.guide FOR EACH ROW EXECUTE FUNCTION app.check_guide_category();
CREATE TRIGGER release_category_integrity BEFORE INSERT ON app.release FOR EACH ROW EXECUTE FUNCTION app.check_guide_category();
ALTER TABLE app.category ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.catalog_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.catalog_item_version ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.guide_requirement_reference ENABLE ROW LEVEL SECURITY;
CREATE POLICY category_read ON app.category FOR SELECT USING(app.category_readable(workspace_id,id));
CREATE POLICY category_insert ON app.category FOR INSERT WITH CHECK(app.in_scope(workspace_id) AND app.member_role(workspace_id)='owner');
CREATE POLICY category_update ON app.category FOR UPDATE USING(app.in_scope(workspace_id) AND app.member_role(workspace_id)='owner') WITH CHECK(app.in_scope(workspace_id) AND app.member_role(workspace_id)='owner');
CREATE POLICY catalog_read ON app.catalog_item FOR SELECT USING(app.catalog_readable(workspace_id,id));
CREATE POLICY catalog_insert ON app.catalog_item FOR INSERT WITH CHECK(app.in_scope(workspace_id) AND app.member_role(workspace_id)='owner');
CREATE POLICY catalog_update ON app.catalog_item FOR UPDATE USING(app.in_scope(workspace_id) AND app.member_role(workspace_id)='owner') WITH CHECK(app.in_scope(workspace_id) AND app.member_role(workspace_id)='owner');
CREATE POLICY catalog_version_read ON app.catalog_item_version FOR SELECT USING(app.in_scope(workspace_id) AND app.member_role(workspace_id)='owner');
CREATE POLICY requirement_ref_owner ON app.guide_requirement_reference FOR ALL USING(app.in_scope(workspace_id) AND app.member_role(workspace_id)='owner') WITH CHECK(app.in_scope(workspace_id) AND app.member_role(workspace_id)='owner');
DROP FUNCTION app.published_guides(text);
CREATE FUNCTION app.published_guides(w text) RETURNS TABLE(id text,workspace_id text,audience text,artwork text,author text,is_sample boolean,document jsonb,category text,license text,release integer,updated_at timestamptz,category_id text,category_path jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT g.id,g.workspace_id,g.audience,g.artwork,r.author,r.is_sample,r.document,c.name,r.license,r.number,r.created_at,r.category_id,app.category_path(w,r.category_id)
 FROM app.guide g JOIN app.release r ON r.guide_id=g.id AND r.number=g.current_release JOIN app.category c ON c.id=r.category_id
 WHERE g.workspace_id=w AND app.release_readable(g.workspace_id,g.id) AND app.category_readable(w,r.category_id)
$$;
REVOKE ALL ON FUNCTION app.normalized_name(text),app.category_readable(text,text),app.category_path(text,text),app.catalog_readable(text,text),app.check_category_tree(),app.check_catalog_item(),app.snapshot_catalog_item(),app.check_guide_category(),app.published_guides(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.normalized_name(text),app.category_readable(text,text),app.category_path(text,text),app.catalog_readable(text,text),app.published_guides(text) TO guide_runtime;
GRANT SELECT,INSERT,UPDATE ON app.category,app.catalog_item TO guide_runtime;
GRANT SELECT ON app.catalog_item_version TO guide_runtime;
GRANT SELECT,INSERT,DELETE ON app.guide_requirement_reference TO guide_runtime;
-- Upgrade only mutable drafts; exact legacy preparation labels remain unresolved for owner review.
UPDATE app.guide g SET document=g.document || jsonb_build_object(
 'schemaVersion',4,'tools','[]'::jsonb,'requirements','[]'::jsonb,
 'unresolvedTools',coalesce((SELECT jsonb_agg(jsonb_build_object('id',gen_random_uuid()::text,'label',t.value) ORDER BY t.ordinality) FROM jsonb_array_elements_text(g.document->'tools') WITH ORDINALITY t(value,ordinality)),'[]'::jsonb),
 'steps',(SELECT jsonb_agg(s.value || '{"requirements":[],"preconditions":[],"earlierStepIds":[]}'::jsonb ORDER BY s.ordinality) FROM jsonb_array_elements(g.document->'steps') WITH ORDINALITY s(value,ordinality))
) WHERE state IN('draft','published') AND document->>'schemaVersion' IN('1','2','3');
