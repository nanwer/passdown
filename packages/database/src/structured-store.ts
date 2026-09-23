import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { Actor } from '@guide/core';
import {
  ApplicationError,
  createCategorySchema,
  updateCategorySchema,
  createCatalogItemSchema,
  updateCatalogItemSchema,
  type Category,
  type CategoryBlockers,
  type CategoryCounts,
  type CategoryDomain,
  type CatalogItem,
  type CatalogKind,
  type CatalogUsage,
  type CatalogUsageCounts,
  type CreateCategoryInput,
  type UpdateCategoryInput,
  type CreateCatalogItemInput,
  type UpdateCatalogItemInput,
} from '@guide/contracts';
import type { GuideDocument } from '@guide/content';

type Client = pg.PoolClient;
type Row = Record<string, any>;
type Transaction = <T>(
  actor: Actor,
  workspaceId: string | undefined,
  run: (client: Client) => Promise<T>,
) => Promise<T>;
const missing = () => new ApplicationError('NOT_FOUND', 'Category or catalog item not found.', 404);
export const validation = (message: string, path?: string) =>
  new ApplicationError('VALIDATION_ERROR', message, 422, path ? [{ path, message }] : undefined);
function parse<T>(
  schema: {
    safeParse: (
      input: unknown,
    ) =>
      | { success: true; data: T }
      | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
  },
  input: unknown,
): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'Check the highlighted fields.',
      422,
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  return result.data;
}
export function categoryDTO(row: Row): Category {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    code: row.code,
    domain: row.domain,
    parentId: row.parent_id,
    name: row.name,
    description: row.description,
    visibility: row.visibility,
    archived: row.archived,
    version: row.version,
    sortOrder: row.sort_order,
    path: row.path,
    imageAssetId: row.image_asset_id ?? null,
  };
}
export function catalogDTO(row: Row): CatalogItem {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    specification: row.specification,
    description: row.description,
    manufacturer: row.manufacturer,
    model: row.model,
    partNumber: row.part_number,
    defaultUnit: row.default_unit,
    visibility: row.visibility,
    archived: row.archived,
    version: row.version,
  };
}
export async function lockStructured(client: Client, workspaceId: string) {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,719821007))', [workspaceId]);
}
export async function selectedCategory(
  client: Client,
  workspaceId: string,
  id: string,
  domain: CategoryDomain,
  publicOnly = false,
) {
  const row = (
    await client.query(
      'SELECT c.*,app.category_path(workspace_id,id) AS path FROM app.category c WHERE workspace_id=$1 AND id=$2',
      [workspaceId, id],
    )
  ).rows[0];
  if (!row || row.archived || row.domain !== domain)
    throw validation(
      'Choose an active category in this workspace and category tree.',
      'categoryId',
    );
  if (publicOnly && row.visibility !== 'public')
    throw validation(
      'Public guides require a public category. Make the category public or choose another branch.',
      'categoryId',
    );
  return categoryDTO(row);
}
export async function validateRequirements(
  client: Client,
  workspaceId: string,
  document: GuideDocument,
  existing: GuideDocument | undefined,
  publicOnly = false,
) {
  if (document.schemaVersion !== 5) return;
  const prior = existing?.schemaVersion === 5 ? existing.requirements : [];
  for (const [index, requirement] of document.requirements.entries()) {
    const row = (
      await client.query(
        'SELECT i.*,v.snapshot FROM app.catalog_item i JOIN app.catalog_item_version v ON v.workspace_id=i.workspace_id AND v.item_id=i.id AND v.version=$3 WHERE i.workspace_id=$1 AND i.id=$2',
        [workspaceId, requirement.itemId, requirement.itemVersion],
      )
    ).rows[0];
    const path = `document.requirements.${index}`;
    if (!row)
      throw validation(
        'This catalog item or selected version is unavailable in this workspace. Choose another item.',
        path,
      );
    const snapshot = row.snapshot;
    // The item's own details must match the version this guide froze. The
    // role is deliberately absent: it says what this guide does with the item,
    // which is the guide's decision and not something the catalog can confirm.
    const expected = {
      name: snapshot.name,
      specification: snapshot.specification,
      description: snapshot.description,
      manufacturer: snapshot.manufacturer,
      model: snapshot.model,
      partNumber: snapshot.part_number,
    };
    for (const [field, value] of Object.entries(expected))
      if ((requirement as Record<string, unknown>)[field] !== value)
        throw validation(
          'Selected details do not match this catalog version. Review and select the item again.',
          `${path}.${field}`,
        );
    if (
      row.archived &&
      !prior.some(
        (r) => r.itemId === requirement.itemId && r.itemVersion === requirement.itemVersion,
      )
    )
      throw validation(
        'This item is archived and cannot be added to a guide. Choose an active item.',
        path,
      );
    if (publicOnly) {
      // The item now, and the exact version this guide froze, must both be
      // public. There is no third answer to inherit from a tree: visibility is
      // the item's own, and the snapshot is what a reader will actually see.
      if (row.visibility !== 'public' || snapshot.visibility !== 'public')
        throw validation(
          'Public guides need a public item, and the version this guide uses must have been public too. Review the item, or choose another.',
          path,
        );
    }
  }
}
export async function projectRequirements(
  client: Client,
  workspaceId: string,
  guideId: string,
  release: number,
  document: GuideDocument,
) {
  if (release === 0)
    await client.query(
      'DELETE FROM app.guide_requirement_reference WHERE workspace_id=$1 AND guide_id=$2 AND release_number=0',
      [workspaceId, guideId],
    );
  if (document.schemaVersion !== 5) return;
  for (const requirement of document.requirements)
    await client.query(
      'INSERT INTO app.guide_requirement_reference(workspace_id,guide_id,release_number,requirement_id,item_id,item_version) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',
      [workspaceId, guideId, release, requirement.id, requirement.itemId, requirement.itemVersion],
    );
}
export function structuredStore(
  transaction: Transaction,
  owner: (c: Client, w: string) => Promise<Row>,
) {
  const categoryQuery = 'SELECT c.*,app.category_path(workspace_id,id) AS path FROM app.category c';
  const itemQuery = 'SELECT i.* FROM app.catalog_item i';
  async function category(client: Client, w: string, id: string) {
    const row = (await client.query(`${categoryQuery} WHERE workspace_id=$1 AND id=$2`, [w, id]))
      .rows[0];
    return row ? categoryDTO(row) : null;
  }
  async function item(client: Client, w: string, id: string) {
    const row = (await client.query(`${itemQuery} WHERE workspace_id=$1 AND id=$2`, [w, id]))
      .rows[0];
    return row ? catalogDTO(row) : null;
  }
  return {
    async listCategories(
      actor: Actor,
      workspaceId: string,
      filter?: { domain?: CategoryDomain; includeArchived?: boolean },
    ): Promise<Category[]> {
      return transaction(actor, workspaceId, async (c) =>
        (
          await c.query(
            `${categoryQuery} WHERE workspace_id=$1 AND ($2::text IS NULL OR domain=$2) AND ($3 OR NOT archived) ORDER BY sort_order,app.normalized_name(name),id`,
            [workspaceId, filter?.domain ?? null, filter?.includeArchived === true],
          )
        ).rows.map(categoryDTO),
      );
    },
    async getCategory(actor: Actor, workspaceId: string, id: string) {
      return transaction(actor, workspaceId, (c) => category(c, workspaceId, id));
    },
    /** The code the server would assign next, used to prefill the create form. */
    async proposeCategoryCode(
      actor: Actor,
      workspaceId: string,
      domain: CategoryDomain,
    ): Promise<string> {
      return transaction(actor, workspaceId, async (c) => {
        await owner(c, workspaceId);
        return (
          await c.query('SELECT app.next_category_code($1,$2) AS code', [workspaceId, domain])
        ).rows[0].code;
      });
    },
    /** What currently stops this category being deactivated, so the interface
     *  can explain it and offer a route rather than surfacing a raised error. */
    async categoryBlockers(
      actor: Actor,
      workspaceId: string,
      id: string,
    ): Promise<CategoryBlockers> {
      return transaction(actor, workspaceId, async (c) => {
        await owner(c, workspaceId);
        const row = (await c.query('SELECT * FROM app.category_blockers($1,$2)', [workspaceId, id]))
          .rows[0];
        if (!row) throw missing();
        return {
          activeChildren: Number(row.active_children),
          assignedGuides: Number(row.assigned_guides),
          currentReleases: Number(row.current_releases),
          activeItems: Number(row.active_items),
        };
      });
    },
    /**
     * Distinct-guide counts for every readable category in a domain. Counts
     * come from the same authorized scope as the listing, so a public reader
     * can never infer private guides from a total.
     */
    async listCategoryCounts(
      actor: Actor,
      workspaceId: string,
      domain: CategoryDomain,
    ): Promise<CategoryCounts[]> {
      return transaction(actor, workspaceId, async (c) =>
        (
          await c.query(
            'SELECT category_id,direct,subtree,published_direct,published_subtree FROM app.category_guide_counts($1,$2)',
            [workspaceId, domain],
          )
        ).rows.map((row) => ({
          categoryId: row.category_id,
          direct: Number(row.direct),
          subtree: Number(row.subtree),
          publishedDirect: Number(row.published_direct),
          publishedSubtree: Number(row.published_subtree),
        })),
      );
    },
    /**
     * The same counts for a library reader, narrowed to one section.
     *
     * The browse cards used to be counted by listing every guide the reader
     * could see and grouping in JavaScript, which read the whole library to
     * produce a handful of numbers. This asks the database instead.
     *
     * It is a different question from the studio's counts above: a visitor must
     * not learn from a total that a members-only guide exists, and the internal
     * section counts its own guides rather than the public ones beside them.
     */
    async listLibraryCategoryCounts(
      actor: Actor,
      workspaceId: string,
      audience?: 'public' | 'members',
    ): Promise<CategoryCounts[]> {
      return transaction(actor, workspaceId, async (c) =>
        (
          await c.query(
            'SELECT category_id,direct,subtree,published_direct,published_subtree FROM app.category_guide_counts($1,$2,$3)',
            [workspaceId, 'guide', audience ?? null],
          )
        ).rows.map((row) => ({
          categoryId: row.category_id,
          direct: Number(row.direct),
          subtree: Number(row.subtree),
          publishedDirect: Number(row.published_direct),
          publishedSubtree: Number(row.published_subtree),
        })),
      );
    },
    async createCategory(actor: Actor, workspaceId: string, input: CreateCategoryInput) {
      const data = parse(createCategorySchema, input);
      return transaction(actor, workspaceId, async (c) => {
        await owner(c, workspaceId);
        await lockStructured(c, workspaceId);
        const id = randomUUID();
        // A null code lets the database assign the next one for this domain.
        await c.query(
          'INSERT INTO app.category(id,workspace_id,code,domain,parent_id,name,description,visibility,sort_order) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)',
          [
            id,
            workspaceId,
            data.code ?? null,
            data.domain,
            data.parentId,
            data.name,
            data.description,
            data.visibility,
            data.sortOrder,
          ],
        );
        return (await category(c, workspaceId, id))!;
      });
    },
    /**
     * Sets or clears the picture shown for a thing.
     *
     * Kept apart from updateCategory, which carries an expectedVersion and is
     * about renaming and moving. A picture is not a rename, and making someone
     * resolve a version conflict to change one would be a poor trade.
     */
    async setCategoryImage(
      actor: Actor,
      workspaceId: string,
      id: string,
      assetId: string | null,
    ): Promise<Category> {
      return transaction(actor, workspaceId, async (c) => {
        await owner(c, workspaceId);
        const updated = await c.query(
          'UPDATE app.category SET image_asset_id=$3 WHERE workspace_id=$1 AND id=$2',
          [workspaceId, id, assetId],
        );
        if (!updated.rowCount) throw missing();
        return (await category(c, workspaceId, id))!;
      });
    },
    async updateCategory(
      actor: Actor,
      workspaceId: string,
      id: string,
      input: UpdateCategoryInput,
    ) {
      const data = parse(updateCategorySchema, input);
      return transaction(actor, workspaceId, async (c) => {
        await owner(c, workspaceId);
        await lockStructured(c, workspaceId);
        const current = await category(c, workspaceId, id);
        if (!current) throw missing();
        if (current.version !== data.expectedVersion)
          throw new ApplicationError(
            'CONFLICT',
            'This category changed. Reload it before saving.',
            409,
          );
        await c.query(
          'UPDATE app.category SET domain=$3,parent_id=$4,name=$5,description=$6,visibility=$7,sort_order=$8,archived=$9,version=version+1 WHERE workspace_id=$1 AND id=$2',
          [
            workspaceId,
            id,
            data.domain,
            data.parentId,
            data.name,
            data.description,
            data.visibility,
            data.sortOrder,
            data.archived,
          ],
        );
        return (await category(c, workspaceId, id))!;
      });
    },
    async listCatalogItems(
      actor: Actor,
      workspaceId: string,
      filter?: {
        search?: string;
        includeArchived?: boolean;
      },
    ): Promise<CatalogItem[]> {
      return transaction(actor, workspaceId, async (c) => {
        const rows = (
          await c.query(
            `${itemQuery} WHERE workspace_id=$1 AND ($2 OR NOT archived) ORDER BY app.normalized_name(name),specification,id`,
            [workspaceId, filter?.includeArchived === true],
          )
        ).rows.map(catalogDTO);
        const q = (filter?.search ?? '')
          .slice(0, 200)
          .normalize('NFKC')
          .toLocaleLowerCase('en')
          .trim();
        return rows.filter(
          (r) =>
            !q ||
            `${r.name} ${r.specification} ${r.manufacturer} ${r.model} ${r.partNumber}`
              .normalize('NFKC')
              .toLocaleLowerCase('en')
              .includes(q),
        );
      });
    },
    async getCatalogItem(actor: Actor, workspaceId: string, id: string) {
      return transaction(actor, workspaceId, (c) => item(c, workspaceId, id));
    },
    async createCatalogItem(actor: Actor, workspaceId: string, input: CreateCatalogItemInput) {
      const data = parse(createCatalogItemSchema, input);
      return transaction(actor, workspaceId, async (c) => {
        await owner(c, workspaceId);
        await lockStructured(c, workspaceId);
        const id = randomUUID();
        await c.query(
          'INSERT INTO app.catalog_item(id,workspace_id,name,specification,description,manufacturer,model,part_number,default_unit,visibility) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
          [
            id,
            workspaceId,
            data.name,
            data.specification,
            data.description,
            data.manufacturer,
            data.model,
            data.partNumber,
            data.defaultUnit,
            data.visibility,
          ],
        );
        return (await item(c, workspaceId, id))!;
      });
    },
    async updateCatalogItem(
      actor: Actor,
      workspaceId: string,
      id: string,
      input: UpdateCatalogItemInput,
    ) {
      const data = parse(updateCatalogItemSchema, input);
      return transaction(actor, workspaceId, async (c) => {
        await owner(c, workspaceId);
        await lockStructured(c, workspaceId);
        const current = await item(c, workspaceId, id);
        if (!current) throw missing();
        if (current.version !== data.expectedVersion)
          throw new ApplicationError(
            'CONFLICT',
            'This catalog item changed. Reload it before saving.',
            409,
          );
        await c.query(
          'UPDATE app.catalog_item SET name=$3,specification=$4,description=$5,manufacturer=$6,model=$7,part_number=$8,default_unit=$9,visibility=$10,archived=$11,version=version+1 WHERE workspace_id=$1 AND id=$2',
          [
            workspaceId,
            id,
            data.name,
            data.specification,
            data.description,
            data.manufacturer,
            data.model,
            data.partNumber,
            data.defaultUnit,
            data.visibility,
            data.archived,
          ],
        );
        return (await item(c, workspaceId, id))!;
      });
    },
    /** Usage for every readable item at once, for the catalog listing. */
    async listCatalogUsage(actor: Actor, workspaceId: string): Promise<CatalogUsageCounts[]> {
      return transaction(actor, workspaceId, async (c) =>
        (
          await c.query(
            'SELECT item_id,draft_guides,published_guides,distinct_guides FROM app.catalog_usage_counts($1)',
            [workspaceId],
          )
        ).rows.map((row) => ({
          itemId: row.item_id,
          draftGuides: Number(row.draft_guides),
          publishedGuides: Number(row.published_guides),
          distinctGuides: Number(row.distinct_guides),
        })),
      );
    },
    async getCatalogUsage(actor: Actor, workspaceId: string, id: string): Promise<CatalogUsage> {
      return transaction(actor, workspaceId, async (c) => {
        await owner(c, workspaceId);
        if (!(await item(c, workspaceId, id))) throw missing();
        const guides = (
          await c.query(
            'SELECT DISTINCT g.id,g.document->>\'title\' AS title,g.audience,g.current_release AS "currentRelease" FROM app.guide_requirement_reference r JOIN app.guide g ON g.id=r.guide_id AND g.workspace_id=r.workspace_id WHERE r.workspace_id=$1 AND r.item_id=$2 AND (r.release_number=0 OR r.release_number=g.current_release) ORDER BY title,g.id',
            [workspaceId, id],
          )
        ).rows;
        return { guides };
      });
    },
  };
}
