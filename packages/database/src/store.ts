import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { readSchemaState } from './schema-state';

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
  libraryPageSize,
  maxLibraryPageSize,
  type StudioWorkspace,
  type DraftSummary,
  type DraftGuide,
  type PublishedGuide,
  type PublishedGuidePage,
  type CreateDraftInput,
  type SaveDraftInput,
  type PublishInput,
  type GuideFamily,
} from '@guide/contracts';

/** True for our own errors however the contracts module was bundled. */
function isApplicationError(error: unknown): error is ApplicationError {
  if (error instanceof ApplicationError) return true;
  const candidate = error as { name?: unknown; status?: unknown; code?: unknown } | null;
  return (
    !!candidate &&
    candidate.name === 'ApplicationError' &&
    typeof candidate.status === 'number' &&
    typeof candidate.code === 'string'
  );
}

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
/**
 * Every picture a step names must be an asset of this workspace.
 *
 * Checked on the server because an identifier from the client is untrusted:
 * without this, a document could claim an asset belonging to another workspace
 * and a later reference would grant access to it.
 */
async function validateMedia(client: pg.PoolClient, workspaceId: string, document: GuideDocument) {
  const ids = [...new Set(document.steps.flatMap((step) => step.media.map((m) => m.assetId)))];
  if (!ids.length) return;
  const known = (
    await client.query('SELECT id FROM app.asset WHERE workspace_id=$1 AND id=ANY($2::text[])', [
      workspaceId,
      ids,
    ])
  ).rows.map((row: { id: string }) => row.id);
  const missing = ids.filter((id) => !known.includes(id));
  if (missing.length)
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'An image in this guide is no longer available. Remove it and add the picture again.',
      422,
      missing.map((id) => ({ path: `document.media.${id}`, message: 'Unknown image.' })),
    );
}

/**
 * Records which pictures a draft or a release uses, so access can follow a
 * live reference. Draft rows are replaced on every save; release rows are
 * written once and never revisited, which is what keeps a published guide's
 * images readable exactly as long as that release is current.
 */
async function projectMedia(
  client: pg.PoolClient,
  workspaceId: string,
  guideId: string,
  release: number,
  document: GuideDocument,
) {
  if (release === 0)
    await client.query(
      'DELETE FROM app.asset_reference WHERE workspace_id=$1 AND guide_id=$2 AND release_number=0',
      [workspaceId, guideId],
    );
  const ids = [...new Set(document.steps.flatMap((step) => step.media.map((m) => m.assetId)))];
  for (const assetId of ids)
    await client.query(
      'INSERT INTO app.asset_reference(workspace_id,asset_id,guide_id,release_number) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [workspaceId, assetId, guideId, release],
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
      // Recognised by shape as well as by instanceof: the bundler can produce
      // more than one copy of the contracts module, and an error thrown across
      // that boundary is the same class but fails instanceof. Today such an
      // error would fall through the codes below and be rethrown unchanged, but
      // that is luck rather than design — a catch-all added later would turn it
      // into a generic failure.
      if (isApplicationError(error)) throw error;
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
    /**
     * One bounded page of the published library, with the total that matched.
     *
     * Every predicate is applied in the database. Filtering here instead would
     * mean reading every current release — each carrying its whole document —
     * on every page view and every keystroke of live search, which is work that
     * grows with the collection rather than with the answer.
     *
     * The audience argument narrows an authorized set into one section. The
     * SQL applies the actor's read scope first and audience afterwards, so it
     * can only ever remove guides, never reveal one.
     */
    async listReleases(
      actor: Actor,
      workspaceId: string,
      filter?: {
        search?: string;
        category?: string;
        categoryId?: string;
        audience?: 'public' | 'members';
        limit?: number;
        offset?: number;
      },
    ): Promise<PublishedGuidePage> {
      const limit = Math.min(
        Math.max(Math.trunc(filter?.limit ?? libraryPageSize) || libraryPageSize, 1),
        maxLibraryPageSize,
      );
      const offset = Math.max(Math.trunc(filter?.offset ?? 0) || 0, 0);
      const search = (filter?.search ?? '').trim().slice(0, 200);
      const predicate = [
        workspaceId,
        filter?.audience ?? null,
        filter?.category || null,
        filter?.categoryId || null,
        search || null,
      ];
      return transaction(actor, workspaceId, async (c) => {
        const total = Number(
          (await c.query('SELECT app.published_guide_total($1,$2,$3,$4,$5) AS total', predicate))
            .rows[0].total,
        );
        const guides = (
          await c.query('SELECT * FROM app.published_guide_page($1,$2,$3,$4,$5,$6,$7)', [
            ...predicate,
            limit,
            offset,
          ])
        ).rows.map(published);
        return { guides, total, limit, offset };
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
      data.document = toStructuredDocument(data.document, randomUUID);
      return transaction(actor, workspaceId, async (c) => {
        const workspace = await owner(c, workspaceId);
        await lockStructured(c, workspaceId);
        const category = await selectedCategory(c, workspaceId, data.categoryId, 'guide');
        await validateRequirements(c, workspaceId, data.document, undefined);
        await validateMedia(c, workspaceId, data.document);
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
        await projectMedia(c, workspaceId, result.rows[0].id, 0, data.document);
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
        await projectMedia(c, workspaceId, id, 0, data.document);
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
        await validateMedia(c, workspaceId, document);
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
        // Freeze this release's pictures alongside its content, so the images
        // stay readable for exactly as long as this release is current.
        await projectMedia(c, workspaceId, id, number, document);
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
    /**
     * Whether a counter has already reached its limit, without consuming one.
     *
     * Lets a caller reject an address that is already locked out before doing
     * the expensive work, while leaving the decision of what counts as an
     * attempt to the caller.
     */
    async rateLimitReached(key: string, limit: number): Promise<boolean> {
      const row = (
        await pool.query('SELECT count FROM app.rate_limit WHERE key=$1 AND expires_at>now()', [
          key,
        ])
      ).rows[0];
      return Boolean(row) && Number(row.count) >= limit;
    },
    /** Forgets a counter, used when an attempt succeeds. */
    async clearRateLimit(key: string): Promise<void> {
      await pool.query('DELETE FROM app.rate_limit WHERE key=$1', [key]);
    },
    /**
     * Records an already-processed upload. The row is immutable: replacing a
     * picture creates a new asset, so a published release keeps the exact
     * images it was published with.
     */
    async createAsset(
      actor: Actor,
      workspaceId: string,
      asset: {
        id: string;
        contentHash: string;
        mediaType: string;
        byteSize: number;
        width: number;
        height: number;
      },
    ) {
      return transaction(actor, workspaceId, async (c) => {
        await owner(c, workspaceId);
        await c.query(
          'INSERT INTO app.asset(id,workspace_id,content_hash,media_type,byte_size,width,height,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,app.actor_id())',
          [
            asset.id,
            workspaceId,
            asset.contentHash,
            asset.mediaType,
            asset.byteSize,
            asset.width,
            asset.height,
          ],
        );
        return asset.id;
      });
    },
    /**
     * Whether this actor may read an asset's bytes right now. Decided by a
     * live reference rather than by possession of the identifier, so a
     * withdrawn release stops granting access to its pictures.
     */
    async assetReadable(actor: Actor, workspaceId: string, assetId: string): Promise<boolean> {
      return transaction(actor, workspaceId, async (c) => {
        const row = (
          await c.query('SELECT app.asset_readable($1,$2) AS allowed', [workspaceId, assetId])
        ).rows[0];
        return row?.allowed === true;
      });
    },
    /**
     * What stands between this guide and the public section, by name.
     *
     * Offered before the choice rather than after it, so an author reads why a
     * move is unavailable instead of being refused once they have decided.
     */
    async guidePublicBlockers(
      actor: Actor,
      workspaceId: string,
      guideId: string,
    ): Promise<{ kind: 'workspace' | 'category' | 'item'; name: string }[]> {
      return transaction(actor, workspaceId, async (c) => {
        await owner(c, workspaceId);
        return (
          await c.query('SELECT kind,name FROM app.guide_public_blockers($1,$2)', [
            workspaceId,
            guideId,
          ])
        ).rows;
      });
    },
    /**
     * Moves a guide between a workspace's public and internal sections.
     *
     * `expectedRelease` is the release the author was looking at when they
     * decided. If someone published in the meantime the move is refused, so
     * nobody makes public a version they have not read.
     *
     * Going public is checked against everything the current release depends
     * on; going internal is always allowed, because it only removes access.
     */
    async setGuideAudience(
      actor: Actor,
      workspaceId: string,
      id: string,
      audience: 'public' | 'members',
      expectedRelease: number | null,
    ): Promise<DraftGuide> {
      if (audience !== 'public' && audience !== 'members')
        throw new ApplicationError('VALIDATION_ERROR', 'Choose a public or internal section.', 422);
      return transaction(actor, workspaceId, async (c) => {
        await lockStructured(c, workspaceId);
        const current = await lockedDraft(c, workspaceId, id);
        if (current.current_release !== expectedRelease) throw conflict();
        if (current.audience !== audience) {
          await c.query(
            'UPDATE app.guide SET audience=$3,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2',
            [workspaceId, id, audience],
          );
          const details = {
            from: current.audience,
            to: audience,
            release: current.current_release,
          };
          await c.query(
            "INSERT INTO app.audit(id,workspace_id,guide_id,actor_id,action,details) VALUES($1,$2,$3,app.actor_id(),'guide.audience_changed',$4)",
            [randomUUID(), workspaceId, id, details],
          );
          await c.query(
            "INSERT INTO app.outbox(id,workspace_id,guide_id,event,payload) VALUES($1,$2,$3,'guide.audience_changed',$4)",
            [randomUUID(), workspaceId, id, details],
          );
        }
        const row = (
          await c.query('SELECT * FROM app.guide WHERE workspace_id=$1 AND id=$2', [
            workspaceId,
            id,
          ])
        ).rows[0];
        const category = await selectedCategory(
          c,
          workspaceId,
          row.category_id,
          'guide',
          row.audience === 'public',
        ).catch(() => null);
        return draft({ ...row, category_path: category?.path ?? [] });
      });
    },
    /**
     * Places a guide beneath another, or removes it from its family.
     *
     * A guide may have one parent, so setting a new one replaces the old link
     * rather than adding a second route up. Cycles, self-links and links
     * across workspaces are refused by the database.
     */
    async setGuideParent(
      actor: Actor,
      workspaceId: string,
      guideId: string,
      parentGuideId: string | null,
      sortOrder = 0,
    ) {
      // The database refuses this too, but its message names a constraint
      // rather than explaining anything, and this is the one bad link a person
      // could plausibly send.
      if (parentGuideId === guideId)
        throw new ApplicationError(
          'VALIDATION_ERROR',
          'A guide cannot be its own broader guide.',
          422,
        );
      return transaction(actor, workspaceId, async (c) => {
        await owner(c, workspaceId);
        if (!parentGuideId) {
          await c.query(
            'DELETE FROM app.guide_family WHERE workspace_id=$1 AND child_guide_id=$2',
            [workspaceId, guideId],
          );
          return;
        }
        await c.query(
          `INSERT INTO app.guide_family(workspace_id,child_guide_id,parent_guide_id,sort_order)
           VALUES($1,$2,$3,$4)
           ON CONFLICT(workspace_id,child_guide_id)
           DO UPDATE SET parent_guide_id=EXCLUDED.parent_guide_id,sort_order=EXCLUDED.sort_order`,
          [workspaceId, guideId, parentGuideId, sortOrder],
        );
      });
    },
    /**
     * Where a guide sits in its family: the path up to the top, and the guides
     * directly beneath it.
     *
     * Both come through the reader's own scope, so an ancestor or a variant
     * the actor may not read is simply absent — no placeholder, and no count
     * that would betray it.
     */
    async getGuideFamily(actor: Actor, workspaceId: string, guideId: string): Promise<GuideFamily> {
      return transaction(actor, workspaceId, async (c) => {
        const ancestors = (
          await c.query(
            `WITH RECURSIVE up AS (
               SELECT f.parent_guide_id AS id, 1 AS depth
               FROM app.guide_family f
               WHERE f.workspace_id=$1 AND f.child_guide_id=$2
               UNION ALL
               SELECT f.parent_guide_id, up.depth+1
               FROM app.guide_family f JOIN up ON f.child_guide_id=up.id
               WHERE f.workspace_id=$1 AND up.depth<=8
             )
             SELECT p.id, p.document->>'title' AS title
             FROM up JOIN app.published_guides($1) p ON p.id=up.id
             ORDER BY up.depth DESC`,
            [workspaceId, guideId],
          )
        ).rows;
        const children = (
          await c.query(
            `SELECT p.id, p.document->>'title' AS title
             FROM app.guide_family f
             JOIN app.published_guides($1) p ON p.id=f.child_guide_id
             WHERE f.workspace_id=$1 AND f.parent_guide_id=$2
             ORDER BY f.sort_order, p.document->>'title'`,
            [workspaceId, guideId],
          )
        ).rows;
        return { ancestors, children };
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
    /**
     * Whether this database matches the migrations this build ships with.
     * Read at startup so a schema mismatch is reported once, by name, instead
     * of surfacing later as an unrelated failure on whichever request first
     * needs the missing object.
     */
    async schemaState() {
      const client = await pool.connect();
      try {
        return await readSchemaState(client);
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
