import { createHash, randomBytes, randomUUID } from 'node:crypto';
import pg from 'pg';
import { readSchemaState } from './schema-state';

import { actorSchema, type Actor } from '@guide/core';
import {
  guideDocumentSchema,
  hasInstructionText,
  toStructuredDocument,
  getRequirementIssues,
  defaultGuideTypes,
  type GuideDocument,
  type GuideType,
} from '@guide/content';
import {
  ApplicationError,
  createDraftSchema,
  inviteSchema,
  saveDraftSchema,
  publishSchema,
  assetPageSize,
  libraryPageSize,
  maxLibraryPageSize,
  type StudioWorkspace,
  type DraftSummary,
  type DraftGuide,
  type PublishedGuide,
  type WorkspaceAsset,
  type PublishedGuidePage,
  type CreateDraftInput,
  type SaveDraftInput,
  type PublishInput,
  type GuideFamily,
  type GuideTypeSelection,
  type InviteInput,
  type WorkspacePeople,
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
  coverAssetId: string | null = null,
) {
  if (release === 0)
    await client.query(
      'DELETE FROM app.asset_reference WHERE workspace_id=$1 AND guide_id=$2 AND release_number=0',
      [workspaceId, guideId],
    );
  const ids = [
    ...new Set(
      [
        ...document.steps.flatMap((step) => step.media.map((m) => m.assetId)),
        // The cover is referenced like a step picture, which is what makes it
        // readable to whoever may read the guide and to nobody else.
        ...(coverAssetId ? [coverAssetId] : []),
      ].filter(Boolean),
    ),
  ];
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
    coverAssetId: row.cover_asset_id ?? null,
    guideType: row.guide_type_key
      ? { key: row.guide_type_key, subject: row.guide_type_subject ?? '' }
      : null,
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
    coverAssetId: row.cover_asset_id ?? null,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}
/**
 * The guide types a workspace actually offers.
 *
 * app.guide_type is an override, not a seeded copy: no rows means the workspace
 * is using the catalog the application ships. Seeding every workspace instead
 * would put the same list in two places and let them drift, and it would make
 * adding a default to a running installation a data migration rather than an
 * edit.
 */
async function effectiveGuideTypes(c: pg.PoolClient, workspaceId: string): Promise<GuideType[]> {
  const rows = (
    await c.query(
      'SELECT key,label,description,prompt,title_template,enabled FROM app.guide_type WHERE workspace_id=$1 ORDER BY sort_order,key',
      [workspaceId],
    )
  ).rows;
  if (!rows.length) return defaultGuideTypes;
  return rows
    .filter((row) => row.enabled)
    .map((row) => ({
      key: row.key,
      label: row.label,
      description: row.description,
      prompt: row.prompt,
      titleTemplate: row.title_template,
    }));
}

/**
 * Check a chosen type against what the workspace offers, and return the columns
 * to store.
 *
 * There is no foreign key behind this — the catalog may be shipped rather than
 * stored — so this is the only thing standing between a typo and a guide
 * claiming to be a kind of work that does not exist.
 */
async function resolveGuideType(
  c: pg.PoolClient,
  workspaceId: string,
  selection: GuideTypeSelection,
): Promise<{ key: string | null; subject: string }> {
  if (!selection) return { key: null, subject: '' };
  const types = await effectiveGuideTypes(c, workspaceId);
  const type = types.find((candidate) => candidate.key === selection.key);
  if (!type)
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'That kind of work is not one this workspace offers.',
      422,
    );
  // A type that asks nothing has nowhere to put an answer, and storing one
  // would leave a value in the release snapshot that no screen can explain.
  if (!type.prompt) return { key: type.key, subject: '' };
  return { key: type.key, subject: selection.subject.trim() };
}

/**
 * What is stored for an invitation token.
 *
 * Plain SHA-256 rather than a password hash on purpose: this is a 256-bit
 * random value, not something a person chose, so there is nothing to slow an
 * attacker down about — and a slow hash on a public endpoint is a way to be
 * knocked over.
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
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
      // A function, table or column the application named is not there. Either
      // the database is behind the migrations this build ships with, or the
      // process is older than the database and is still asking for something a
      // later migration removed — a dropped column reads exactly like this, and
      // it is what a long-running dev server hits after a migration lands.
      //
      // Either way it is drift between two versions, and naming that is far
      // more use than the generic outage this used to fall through to.
      if (code === '42883' || code === '42P01' || code === '42703')
        throw new ApplicationError(
          'SCHEMA_MISMATCH',
          'The application and this database are not on the same schema. Apply any pending migrations, and restart the application if it has been running since before the last one.',
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
    if (!row || row.role !== 'manage') throw missing();
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
              'SELECT w.id,w.name,w.audience,w.root AS "isRoot",m.role FROM app.workspace w JOIN app.membership m ON m.workspace_id=w.id WHERE m.actor_id=app.actor_id() AND m.active ORDER BY w.name',
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
    /**
     * The kinds of work this workspace offers, and whether it composes titles.
     *
     * Returned together because the create form needs both to draw itself, and
     * fetching them separately would let the picker render before it knows
     * whether to show a composed title.
     */
    /**
     * Let an account back in after it has replaced the password it was given.
     *
     * Not a transaction(...) call: this is about the identity of the actor
     * rather than anything inside a workspace, so there is no workspace to
     * scope it to.
     */
    async clearPasswordChangeRequirement(userId: string): Promise<void> {
      const client = await pool.connect();
      try {
        await client.query('UPDATE public.auth_user SET must_change_password=false WHERE id=$1', [
          userId,
        ]);
      } finally {
        client.release();
      }
    },
    /**
     * Who is in a workspace, and who has been asked.
     *
     * Both together because they are one list on screen: somebody with a
     * pending invitation is as much a part of the answer to "who has access"
     * as somebody who has already accepted.
     */
    /**
     * What to show the holder of an invitation link, before they have an
     * account. Null for anything that is not a live invitation — expired,
     * already used and never existed are deliberately indistinguishable.
     */
    /**
     * Confirm an address without sending anything to it.
     *
     * Reached only from accepting an invitation, where a manager of the
     * workspace named the address and the link was the proof of that. There is
     * no mail server to verify it any other way.
     */
    async markEmailVerified(userId: string): Promise<void> {
      const client = await pool.connect();
      try {
        await client.query('UPDATE public.auth_user SET email_verified=true WHERE id=$1', [userId]);
      } finally {
        client.release();
      }
    },

    /**
     * The workspace this installation serves at its root, if it has one.
     *
     * Null is an ordinary answer, not an error: an installation whose only
     * workspace is private has no public front page, and the first-run
     * bootstrap creates a public one but nothing guarantees it stays that way.
     * Every caller has to handle that, which is the whole point of asking
     * rather than assuming a name.
     */
    async rootWorkspace(): Promise<string | null> {
      const client = await pool.connect();
      try {
        return (await client.query('SELECT app.root_workspace() AS id')).rows[0].id ?? null;
      } finally {
        client.release();
      }
    },

    async describeInvitation(
      token: string,
    ): Promise<{ workspaceId: string; workspaceName: string; email: string; role: string } | null> {
      const client = await pool.connect();
      try {
        const { rows } = await client.query(
          'SELECT workspace_id, workspace_name, email, role FROM app.describe_invitation($1)',
          [hashToken(token)],
        );
        if (!rows.length) return null;
        return {
          workspaceId: rows[0].workspace_id,
          workspaceName: rows[0].workspace_name,
          email: rows[0].email,
          role: rows[0].role,
        };
      } finally {
        client.release();
      }
    },

    /**
     * Redeem an invitation for an account that has just been created.
     *
     * Runs outside a workspace scope because the person is not yet in one. The
     * database function is what decides: it re-checks the token, the expiry and
     * that nobody has used it already, all while holding the row.
     */
    async acceptInvitation(token: string, userId: string): Promise<string | null> {
      const client = await pool.connect();
      try {
        const { rows } = await client.query('SELECT app.accept_invitation($1,$2) AS workspace', [
          hashToken(token),
          userId,
        ]);
        return rows[0].workspace ?? null;
      } finally {
        client.release();
      }
    },

    async listPeople(actor: Actor, workspaceId: string): Promise<WorkspacePeople> {
      return transaction(actor, workspaceId, async (c) => {
        await owner(c, workspaceId);
        const members = (
          await c.query(
            `SELECT m.actor_id, m.role, m.active, u.name, u.email
             FROM app.membership m JOIN public.auth_user u ON u.id = m.actor_id
             WHERE m.workspace_id=$1 ORDER BY lower(u.name), u.email`,
            [workspaceId],
          )
        ).rows;
        const invitations = (
          await c.query(
            `SELECT i.id, i.email, i.role, i.expires_at, u.name AS invited_by
             FROM app.invitation i JOIN public.auth_user u ON u.id = i.invited_by
             WHERE i.workspace_id=$1 AND i.accepted_at IS NULL AND i.expires_at > now()
             ORDER BY i.created_at DESC`,
            [workspaceId],
          )
        ).rows;
        return {
          members: members.map((row) => ({
            actorId: row.actor_id,
            name: row.name,
            email: row.email,
            role: row.role,
            active: row.active,
            isYou: actor.kind === 'user' && actor.id === row.actor_id,
          })),
          invitations: invitations.map((row) => ({
            id: row.id,
            email: row.email,
            role: row.role,
            expiresAt: new Date(row.expires_at).toISOString(),
            invitedBy: row.invited_by,
          })),
        };
      });
    },

    /**
     * Invite somebody, and hand back the only copy of the link.
     *
     * The token is returned once and never again — what is stored is its hash,
     * so this value cannot be recovered from the database afterwards. A lost
     * link is replaced by revoking and inviting again, which is the same
     * property that makes a stolen backup useless.
     */
    async inviteToWorkspace(
      actor: Actor,
      workspaceId: string,
      input: InviteInput,
      lifetimeDays = 7,
    ): Promise<{ id: string; token: string; expiresAt: string }> {
      const data = parse(inviteSchema, input);
      return transaction(actor, workspaceId, async (c) => {
        await owner(c, workspaceId);
        const already = await c.query(
          `SELECT 1 FROM app.membership m JOIN public.auth_user u ON u.id = m.actor_id
           WHERE m.workspace_id=$1 AND app.normalized_name(u.email)=app.normalized_name($2)`,
          [workspaceId, data.email],
        );
        if (already.rowCount)
          throw new ApplicationError(
            'VALIDATION_ERROR',
            'That person is already in this workspace.',
            422,
          );
        const token = randomBytes(32).toString('base64url');
        const id = randomUUID();
        const expiresAt = new Date(Date.now() + lifetimeDays * 86400000);
        try {
          await c.query(
            `INSERT INTO app.invitation(workspace_id,id,email,role,token_hash,expires_at,invited_by)
             VALUES($1,$2,$3,$4,$5,$6,app.actor_id())`,
            [workspaceId, id, data.email, data.role, hashToken(token), expiresAt],
          );
        } catch (error) {
          if ((error as { code?: string }).code === '23505')
            throw new ApplicationError(
              'VALIDATION_ERROR',
              'That address already has an invitation waiting. Revoke it first to issue a new one.',
              422,
            );
          throw error;
        }
        return { id, token, expiresAt: expiresAt.toISOString() };
      });
    },

    async revokeInvitation(actor: Actor, workspaceId: string, id: string): Promise<void> {
      await transaction(actor, workspaceId, async (c) => {
        await owner(c, workspaceId);
        const result = await c.query(
          'DELETE FROM app.invitation WHERE workspace_id=$1 AND id=$2 AND accepted_at IS NULL',
          [workspaceId, id],
        );
        if (!result.rowCount) throw missing();
      });
    },

    /**
     * Change or withdraw someone's access.
     *
     * The rule that a workspace keeps at least one manager is not checked here.
     * It is a database trigger, because it is the one mistake the product
     * cannot recover from — a workspace with nobody who can manage it has
     * nobody who can appoint anybody.
     */
    async setMemberRole(
      actor: Actor,
      workspaceId: string,
      memberId: string,
      role: 'manage' | 'view',
    ): Promise<void> {
      await transaction(actor, workspaceId, async (c) => {
        await owner(c, workspaceId);
        const result = await c.query(
          'UPDATE app.membership SET role=$3 WHERE workspace_id=$1 AND actor_id=$2',
          [workspaceId, memberId, role],
        );
        if (!result.rowCount) throw missing();
      });
    },

    async removeMember(actor: Actor, workspaceId: string, memberId: string): Promise<void> {
      await transaction(actor, workspaceId, async (c) => {
        await owner(c, workspaceId);
        const result = await c.query(
          'DELETE FROM app.membership WHERE workspace_id=$1 AND actor_id=$2',
          [workspaceId, memberId],
        );
        if (!result.rowCount) throw missing();
      });
    },

    async guideTypeSettings(
      actor: Actor,
      workspaceId: string,
    ): Promise<{ types: GuideType[]; composeTitles: boolean }> {
      return transaction(actor, workspaceId, async (c) => {
        const row = (
          await c.query('SELECT compose_titles FROM app.workspace WHERE id=$1', [workspaceId])
        ).rows[0];
        if (!row) throw new ApplicationError('NOT_FOUND', 'No such workspace.', 404);
        return {
          types: await effectiveGuideTypes(c, workspaceId),
          composeTitles: row.compose_titles,
        };
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
        const guideType = await resolveGuideType(c, workspaceId, data.guideType ?? null);
        const result = await c.query(
          'INSERT INTO app.guide(id,workspace_id,audience,document,category,author,category_id,guide_type_key,guide_type_subject,cover_asset_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
          [
            randomUUID(),
            workspaceId,
            data.audience,
            data.document,
            category.name,
            author,
            category.id,
            guideType.key,
            guideType.subject,
            data.coverAssetId ?? null,
          ],
        );
        await projectRequirements(c, workspaceId, result.rows[0].id, 0, data.document);
        await projectMedia(
          c,
          workspaceId,
          result.rows[0].id,
          0,
          data.document,
          data.coverAssetId ?? null,
        );
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
        const guideType = await resolveGuideType(c, workspaceId, data.guideType ?? null);
        const row = (
          await c.query(
            'UPDATE app.guide SET document=$3,category=$4,category_id=$5,guide_type_key=$6,guide_type_subject=$7,cover_asset_id=$8,version=version+1,updated_at=clock_timestamp() WHERE workspace_id=$1 AND id=$2 RETURNING *',
            [
              workspaceId,
              id,
              data.document,
              category.name,
              category.id,
              guideType.key,
              guideType.subject,
              data.coverAssetId ?? null,
            ],
          )
        ).rows[0];
        await projectRequirements(c, workspaceId, id, 0, data.document);
        await projectMedia(c, workspaceId, id, 0, data.document, data.coverAssetId ?? null);
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
          'INSERT INTO app.release(guide_id,workspace_id,number,draft_version,document,category,license,author,is_sample,category_id,category_path,guide_type_key,guide_type_subject,cover_asset_id) VALUES($1,$2,$3,$4,$5,$6,$7,(SELECT name FROM public.auth_user WHERE id=app.actor_id()),false,$8,$9,$10,$11,$12)',
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
            // The release freezes what the draft said at this moment, the same
            // way it freezes the category and the document.
            current.guide_type_key,
            current.guide_type_subject ?? '',
            current.cover_asset_id,
          ],
        );
        // Freeze this release's pictures alongside its content, so the images
        // stay readable for exactly as long as this release is current.
        await projectMedia(c, workspaceId, id, number, document, current.cover_asset_id);
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
    /**
     * Pictures already in this workspace, newest first, for an author choosing
     * one again rather than uploading it a second time.
     *
     * Owner-only and bounded, like every other listing: a workspace that has
     * been running for years must not answer this by reading its whole history.
     */
    async listAssets(
      actor: Actor,
      workspaceId: string,
      options?: { limit?: number; offset?: number },
    ): Promise<{ assets: WorkspaceAsset[]; total: number }> {
      const limit = Math.min(
        Math.max(Math.trunc(options?.limit ?? assetPageSize) || assetPageSize, 1),
        maxLibraryPageSize,
      );
      const offset = Math.max(Math.trunc(options?.offset ?? 0) || 0, 0);
      return transaction(actor, workspaceId, async (c) => {
        await owner(c, workspaceId);
        const total = Number(
          (
            await c.query('SELECT count(*) AS total FROM app.asset WHERE workspace_id=$1', [
              workspaceId,
            ])
          ).rows[0].total,
        );
        const assets = (
          await c.query(
            `SELECT id,width,height,byte_size,created_at FROM app.asset
             WHERE workspace_id=$1 ORDER BY created_at DESC, id LIMIT $2 OFFSET $3`,
            [workspaceId, limit, offset],
          )
        ).rows.map((row) => ({
          id: row.id as string,
          width: row.width as number,
          height: row.height as number,
          byteSize: Number(row.byte_size),
          createdAt: (row.created_at as Date).toISOString(),
        }));
        return { assets, total };
      });
    },
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
