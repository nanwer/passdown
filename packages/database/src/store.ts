import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { actorSchema, type Actor } from '@guide/core';
import {
  guideDocumentSchema,
  hasInstructionText,
  toStructuredDocument,
  getRequirementIssues,
  type GuideDocument,
} from '@guide/content';
import {
  ApplicationError,
  createDraftSchema,
  saveDraftSchema,
  publishSchema,
  type StudioWorkspace,
  type DraftSummary,
  type DraftGuide,
  type PublishedGuide,
  type CreateDraftInput,
  type SaveDraftInput,
  type PublishInput,
} from '@guide/contracts';
import { localDatabaseURL } from './config';
import {
  structuredStore,
  selectedCategory,
  validateRequirements,
  projectRequirements,
  lockStructured,
  validation,
} from './structured-store';
type Row = Record<string, any>;
const missing = () => new ApplicationError('NOT_FOUND', 'Guide or workspace not found.', 404);
const conflict = () =>
  new ApplicationError(
    'CONFLICT',
    'This guide changed. Reload the current version before saving or publishing.',
    409,
  );
function parse<T>(
  schema: {
    safeParse: (
      value: unknown,
    ) =>
      | { success: true; data: T }
      | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
  },
  value: unknown,
): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'Check the highlighted fields.',
      422,
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  return result.data;
}
function requireTextOnly(document: GuideDocument) {
  if (document.steps.some((step) => step.media.length > 0))
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'Media references are not supported by local text authoring.',
      422,
      [{ path: 'document.steps', message: 'Remove media references before saving.' }],
    );
}
function draft(row: Row): DraftGuide {
  const document = guideDocumentSchema.parse(row.document);
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: document.title,
    summary: document.summary,
    category: row.category_path?.at(-1)?.name ?? row.category,
    categoryId: row.category_id,
    categoryPath: row.category_path ?? [],
    audience: row.audience,
    version: row.version,
    currentRelease: row.current_release,
    publishedVersion: row.published_version,
    updatedAt: new Date(row.updated_at).toISOString(),
    stepCount: document.steps.length,
    document,
  };
}
function published(row: Row): PublishedGuide {
  const document = guideDocumentSchema.parse(row.document);
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: document.title,
    summary: document.summary,
    category: row.category_path?.at(-1)?.name ?? row.category,
    categoryId: row.category_id,
    categoryPath: row.category_path ?? [],
    audience: row.audience,
    state: 'published',
    document,
    artwork: row.artwork,
    author: row.author,
    isSample: row.is_sample,
    release: row.release,
    license: row.license,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
export function createApplicationStore(options: { connectionString: string }) {
  const pool = new pg.Pool({
    connectionString: localDatabaseURL(options.connectionString),
    max: 8,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 10000,
  });
  async function transaction<T>(
    actor: Actor,
    workspaceId: string | undefined,
    run: (client: pg.PoolClient) => Promise<T>,
  ): Promise<T> {
    const who = actorSchema.parse(actor),
      client = await pool.connect();
    try {
      await client.query('BEGIN');
      const permission = (
        await client.query(
          "SELECT NOT rolsuper AND NOT rolbypassrls AND rolname='guide_runtime' AND NOT pg_has_role(current_user,(SELECT relowner FROM pg_class WHERE oid='app.guide'::regclass),'MEMBER') AS safe FROM pg_roles WHERE rolname=current_user",
        )
      ).rows[0];
      if (!permission?.safe) throw new Error('Unsafe application database role configuration.');
      await client.query(
        "SELECT set_config('guide.actor_id',$1,true),set_config('guide.actor_active',$2,true),set_config('guide.workspace_id',$3,true),set_config('guide.actor_kind',$4,true)",
        [
          who.kind === 'user' ? who.id : '',
          String(who.kind === 'anonymous' || who.active),
          workspaceId ?? '',
          who.kind,
        ],
      );
      if (workspaceId) await client.query('SELECT app.lock_scope($1)', [workspaceId]);
      const result = await run(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      if (error instanceof ApplicationError) throw error;
      const code = (error as { code?: string }).code;
      if (code === '42501') throw missing();
      if (code === '23514') throw validation((error as Error).message);
      if (code === '23503')
        throw validation('Choose a related record in this workspace and category tree.');
      if (code === '23505') {
        const constraint = (error as { constraint?: string }).constraint;
        if (constraint === 'category_sibling_name')
          throw validation(
            'A category with this name already exists under the selected parent.',
            'name',
          );
        if (constraint === 'catalog_identifier')
          throw validation(
            'An item with this manufacturer and part number already exists. Reuse the existing item.',
            'partNumber',
          );
        if (constraint === 'category_code_unique')
          throw validation('This code is already used in this workspace. Choose another.', 'code');
        throw conflict();
      }
      if (code === '40001' || code === '40P01') throw conflict();
      // A function or table the application expects is absent, which in
      // practice means the database is behind the migrations on disk. Say so,
      // rather than reporting a generic outage the reader cannot act on.
      if (code === '42883' || code === '42P01')
        throw new ApplicationError(
          'SCHEMA_BEHIND',
          'This database is missing a migration the application needs. Run pnpm local:migrate, then try again.',
          503,
        );
      throw error;
    } finally {
      client.release();
    }
  }
  async function owner(client: pg.PoolClient, workspaceId: string) {
    const row = (
      await client.query(
        'SELECT id,name,audience,app.member_role(id) AS role FROM app.workspace WHERE id=$1',
        [workspaceId],
      )
    ).rows[0];
    if (!row || row.role !== 'owner') throw missing();
    return row;
  }
  async function lockedDraft(client: pg.PoolClient, workspaceId: string, id: string) {
    await owner(client, workspaceId);
    const row = (
      await client.query(
        'SELECT g.*,app.category_path(workspace_id,category_id) AS category_path FROM app.guide g WHERE workspace_id=$1 AND id=$2 FOR UPDATE',
        [workspaceId, id],
      )
    ).rows[0];
    if (!row || row.state === 'redacted' || row.state === 'withdrawn') throw missing();
    return row;
  }
  return {
    ...structuredStore(transaction, owner),
    async listWorkspaces(actor: Actor): Promise<StudioWorkspace[]> {
      return transaction(
        actor,
        undefined,
        async (c) =>
          (
            await c.query(
              'SELECT w.id,w.name,w.audience,m.role FROM app.workspace w JOIN app.membership m ON m.workspace_id=w.id WHERE m.actor_id=app.actor_id() AND m.active ORDER BY w.name',
            )
          ).rows,
      );
    },
    async getWorkspace(
      actor: Actor,
      workspaceId: string,
    ): Promise<Pick<StudioWorkspace, 'id' | 'name' | 'audience'> | null> {
      return transaction(
        actor,
        workspaceId,
        async (c) =>
          (await c.query('SELECT id,name,audience FROM app.workspace WHERE id=$1', [workspaceId]))
            .rows[0] ?? null,
      );
    },
    async listReleases(
      actor: Actor,
      workspaceId: string,
      filter?: {
        search?: string;
        category?: string;
        categoryId?: string;
        audience?: 'public' | 'members';
      },
    ): Promise<PublishedGuide[]> {
      return transaction(actor, workspaceId, async (c) => {
        const rows = (
          await c.query('SELECT * FROM app.published_guides($1) ORDER BY updated_at DESC,id', [
            workspaceId,
          ])
        ).rows.map(published);
        const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase('en');
        const search = normalize((filter?.search ?? '').trim().slice(0, 200));
        return rows.filter(
          (r) =>
            // published_guides already applies the actor's read scope; audience
            // narrows an authorized set into one section, never widens it.
            (!filter?.audience || r.audience === filter.audience) &&
            (!filter?.category || r.category === filter.category) &&
            (!filter?.categoryId || r.categoryPath.some((p) => p.id === filter.categoryId)) &&
            (!search || normalize(`${r.title} ${r.summary}`).includes(search)),
        );
      });
    },
    async getRelease(
      actor: Actor,
      workspaceId: string,
      id: string,
    ): Promise<PublishedGuide | null> {
      return transaction(actor, workspaceId, async (c) => {
        const row = (
          await c.query('SELECT * FROM app.published_guides($1) WHERE id=$2', [workspaceId, id])
        ).rows[0];
        return row ? published(row) : null;
      });
    },
    async listDrafts(actor: Actor, workspaceId: string): Promise<DraftSummary[]> {
      return transaction(actor, workspaceId, async (c) => {
        await owner(c, workspaceId);
        return (
          await c.query(
            "SELECT g.*,app.category_path(workspace_id,category_id) AS category_path FROM app.guide g WHERE workspace_id=$1 AND state NOT IN ('withdrawn','redacted') ORDER BY updated_at DESC,id",
            [workspaceId],
          )
        ).rows.map((row) => {
          const { document: _, ...summary } = draft(row);
          return summary;
        });
      });
    },
    async getDraft(actor: Actor, workspaceId: string, id: string): Promise<DraftGuide | null> {
      return transaction(actor, workspaceId, async (c) => {
        const row = (
          await c.query(
            "SELECT g.*,app.category_path(workspace_id,category_id) AS category_path FROM app.guide g WHERE workspace_id=$1 AND id=$2 AND state NOT IN ('withdrawn','redacted')",
            [workspaceId, id],
          )
        ).rows[0];
        return row ? draft(row) : null;
      });
    },
    async createDraft(
      actor: Actor,
      workspaceId: string,
      input: CreateDraftInput,
    ): Promise<DraftGuide> {
      const data = parse(createDraftSchema, input);
      requireTextOnly(data.document);
      data.document = toStructuredDocument(data.document, randomUUID);
      return transaction(actor, workspaceId, async (c) => {
        const workspace = await owner(c, workspaceId);
        await lockStructured(c, workspaceId);
        const category = await selectedCategory(c, workspaceId, data.categoryId, 'guide');
        await validateRequirements(c, workspaceId, data.document, undefined);
        if (workspace.audience === 'private' && data.audience === 'public')
          throw new ApplicationError(
            'VALIDATION_ERROR',
            'Private workspace guides must be members-only.',
            422,
          );
        const author =
          (await c.query('SELECT name FROM public.auth_user WHERE id=app.actor_id()')).rows[0]
            ?.name ?? workspace.name;
        const result = await c.query(
          'INSERT INTO app.guide(id,workspace_id,audience,document,category,author,category_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *',
          [
            randomUUID(),
            workspaceId,
            data.audience,
            data.document,
            category.name,
            author,
            category.id,
          ],
        );
        await projectRequirements(c, workspaceId, result.rows[0].id, 0, data.document);
        return draft({ ...result.rows[0], category_path: category.path });
      });
    },
    async saveDraft(
      actor: Actor,
      workspaceId: string,
      id: string,
      input: SaveDraftInput,
    ): Promise<DraftGuide> {
      const data = parse(saveDraftSchema, input);
      requireTextOnly(data.document);
      data.document = toStructuredDocument(data.document, randomUUID);
      return transaction(actor, workspaceId, async (c) => {
        await lockStructured(c, workspaceId);
        const current = await lockedDraft(c, workspaceId, id);
        if (current.version !== data.expectedVersion) throw conflict();
        const category = await selectedCategory(c, workspaceId, data.categoryId, 'guide');
        await validateRequirements(
          c,
          workspaceId,
          data.document,
          guideDocumentSchema.parse(current.document),
        );
        const row = (
          await c.query(
            'UPDATE app.guide SET document=$3,category=$4,category_id=$5,version=version+1,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2 RETURNING *',
            [workspaceId, id, data.document, category.name, category.id],
          )
        ).rows[0];
        await projectRequirements(c, workspaceId, id, 0, data.document);
        return draft({ ...row, category_path: category.path });
      });
    },
    async publishDraft(
      actor: Actor,
      workspaceId: string,
      id: string,
      input: PublishInput,
    ): Promise<PublishedGuide> {
      const data = parse(publishSchema, input);
      return transaction(actor, workspaceId, async (c) => {
        await lockStructured(c, workspaceId);
        const current = await lockedDraft(c, workspaceId, id);
        if (
          current.version !== data.expectedVersion ||
          current.current_release !== data.expectedRelease ||
          current.published_version === current.version
        )
          throw conflict();
        const document = toStructuredDocument(
          parse(guideDocumentSchema, current.document),
          randomUUID,
        );
        const category = await selectedCategory(
          c,
          workspaceId,
          current.category_id,
          'guide',
          current.audience === 'public',
        );
        await validateRequirements(
          c,
          workspaceId,
          document,
          document,
          current.audience === 'public',
        );
        const requirementIssues = getRequirementIssues(document);
        if (requirementIssues.length)
          throw new ApplicationError(
            'VALIDATION_ERROR',
            'Resolve the preparation and step requirements before publishing.',
            422,
            requirementIssues.map((issue) => ({
              path: ['document', ...issue.path].join('.'),
              message: issue.message,
            })),
          );
        requireTextOnly(document);
        if (document.steps.some((step) => !hasInstructionText(step.body)))
          throw new ApplicationError(
            'VALIDATION_ERROR',
            'Each published step needs instruction text.',
            422,
          );
        if (current.audience === 'members' && data.license !== 'all-rights-reserved')
          throw new ApplicationError(
            'VALIDATION_ERROR',
            'Private guides use reserved rights.',
            422,
          );
        const number = (current.current_release ?? 0) + 1;
        await c.query(
          'INSERT INTO app.release(guide_id,workspace_id,number,draft_version,document,category,license,author,is_sample,category_id,category_path) VALUES($1,$2,$3,$4,$5,$6,$7,(SELECT name FROM public.auth_user WHERE id=app.actor_id()),false,$8,$9)',
          [
            id,
            workspaceId,
            number,
            current.version,
            document,
            category.name,
            data.license,
            category.id,
            JSON.stringify(category.path),
          ],
        );
        await c.query(
          "UPDATE app.guide SET current_release=$3,published_version=version,state='published',updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2",
          [workspaceId, id, number],
        );
        await projectRequirements(c, workspaceId, id, number, document);
        const details = { release: number, version: current.version, license: data.license };
        await c.query(
          "INSERT INTO app.audit(id,workspace_id,guide_id,actor_id,action,details) VALUES($1,$2,$3,app.actor_id(),'guide.published',$4)",
          [randomUUID(), workspaceId, id, details],
        );
        await c.query(
          "INSERT INTO app.outbox(id,workspace_id,guide_id,event,payload) VALUES($1,$2,$3,'guide.published',$4)",
          [randomUUID(), workspaceId, id, details],
        );
        return published(
          (await c.query('SELECT * FROM app.published_guides($1) WHERE id=$2', [workspaceId, id]))
            .rows[0],
        );
      });
    },
    async consumeRateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
      if (
        !key ||
        key.length > 256 ||
        !Number.isInteger(limit) ||
        limit < 1 ||
        limit > 100000 ||
        !Number.isInteger(windowSeconds) ||
        windowSeconds < 1 ||
        windowSeconds > 86400
      )
        throw new ApplicationError('VALIDATION_ERROR', 'Invalid rate limit configuration.', 422);
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM app.rate_limit WHERE expires_at<=now()');
        const result = await client.query(
          "INSERT INTO app.rate_limit(key,count,expires_at) VALUES($1,1,now()+$3*interval '1 second') ON CONFLICT(key) DO UPDATE SET count=app.rate_limit.count+1 WHERE app.rate_limit.count<$2 RETURNING key",
          [key, limit, windowSeconds],
        );
        await client.query('COMMIT');
        return result.rowCount === 1;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },
    async health(): Promise<boolean> {
      try {
        const result = await pool.query(
          "SELECT NOT rolsuper AND NOT rolbypassrls AND rolname='guide_runtime' AS safe,to_regclass('app.guide') IS NOT NULL AS ready FROM pg_roles WHERE rolname=current_user",
        );
        return result.rows[0]?.safe === true && result.rows[0]?.ready === true;
      } catch {
        return false;
      }
    },
    close: () => pool.end(),
  };
}
