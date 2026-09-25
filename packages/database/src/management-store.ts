import type pg from 'pg';
import type { Actor } from '@guide/core';
import {
  categoryManagementQuerySchema,
  catalogManagementQuerySchema,
  type CategoryManagementQuery,
  type CategoryCounts,
  type CatalogManagementQuery,
  type CategoryManagementPage,
  type CatalogManagementPage,
} from '@guide/contracts';
import { categoryDTO, catalogDTO } from './structured-store';

type Transaction = <T>(
  actor: Actor,
  workspaceId: string | undefined,
  run: (client: pg.PoolClient) => Promise<T>,
) => Promise<T>;
const categorySort = {
  tree: 'sort_order ASC, app.management_sort_key(name) ASC',
  name: 'app.management_sort_key(name)',
  code: 'app.management_sort_key(code)',
  guides: 'subtree',
  published: 'published_subtree',
  visibility: 'visibility',
  status: 'archived',
} as const;
const catalogSort = {
  name: 'app.management_sort_key(name)',
  specification: 'app.management_sort_key(specification)',
  partNumber: 'app.management_sort_key(part_number)',
  manufacturer: 'app.management_sort_key(manufacturer)',
  model: 'app.management_sort_key(model)',
  unit: "CASE default_unit WHEN 'each' THEN 'Each' WHEN 'pair' THEN 'Pair' WHEN 'g' THEN 'Grams (g)' WHEN 'kg' THEN 'Kilograms (kg)' WHEN 'ml' THEN 'Millilitres (ml)' WHEN 'l' THEN 'Litres (l)' WHEN 'mm' THEN 'Millimetres (mm)' WHEN 'cm' THEN 'Centimetres (cm)' WHEN 'm' THEN 'Metres (m)' END",
  visibility: 'visibility',
  guides: 'distinct_guides',
  status: 'archived',
} as const;
const statusPredicate = "($3 = 'all' OR archived = ($3 = 'inactive'))";
const direction = (value: string) => (value === 'descending' ? 'DESC' : 'ASC');
// Every query is one SQL statement: its totals and records share one MVCC
// snapshot, including during concurrent edits. Only bounded page objects cross
// the database boundary. Sort SQL comes exclusively from the allowlists above.
export function managementStore(transaction: Transaction) {
  return {
    async listCategoryCount(
      actor: Actor,
      workspaceId: string,
      id: string,
    ): Promise<CategoryCounts | null> {
      return transaction(actor, workspaceId, async (client) => {
        const row = (
          await client.query(
            "SELECT * FROM app.category_guide_counts($1,'guide',NULL) WHERE category_id=$2",
            [workspaceId, id],
          )
        ).rows[0];
        return row
          ? {
              categoryId: row.category_id,
              direct: Number(row.direct),
              subtree: Number(row.subtree),
              publishedDirect: Number(row.published_direct),
              publishedSubtree: Number(row.published_subtree),
            }
          : null;
      });
    },
    async listCategoryPage(
      actor: Actor,
      workspaceId: string,
      input: CategoryManagementQuery,
    ): Promise<CategoryManagementPage> {
      const query = categoryManagementQuerySchema.parse(input);
      const order =
        query.sort === 'tree'
          ? categorySort.tree
          : `${categorySort[query.sort]} ${direction(query.direction)}${query.sort === 'name' ? '' : ', app.management_sort_key(name) ASC'}`;
      return transaction(actor, workspaceId, async (client) => {
        // The planner cannot estimate the recursive tree below: it prices a
        // workspace of three things in the millions, far past PostgreSQL's
        // default jit_above_cost. Compiling the query then took about 0.75 s
        // on every request, for a statement that runs in under 20 ms, and a
        // table refreshes this page after every change. Scoped to this
        // transaction, which holds only this statement.
        await client.query('SET LOCAL jit = off');
        const result = (
          await client.query(
            `
          WITH RECURSIVE base AS MATERIALIZED (
            SELECT c.*, app.category_path(c.workspace_id,c.id) AS path,
              coalesce(n.direct,0) AS direct, coalesce(n.subtree,0) AS subtree,
              coalesce(n.published_direct,0) AS published_direct, coalesce(n.published_subtree,0) AS published_subtree
            FROM app.category c
            LEFT JOIN app.category_guide_counts($1,'guide',NULL) n ON n.category_id=c.id
            WHERE c.workspace_id=$1 AND c.domain='guide'
          ), filtered AS (
            SELECT *, strpos(app.normalized_name(coalesce((SELECT string_agg(p->>'name',' / ') FROM jsonb_array_elements(path) p),name) || ' ' || code),app.normalized_name($2)) > 0
              AND ($4='all' OR visibility=$4)
              AND ($5='all' OR ($5='used') = (subtree > 0 OR published_subtree > 0)) AS matches_filters
            FROM base
          ), matched AS (
            SELECT * FROM filtered WHERE matches_filters AND ${statusPredicate}
          ), relevant AS (
            SELECT id FROM matched
            UNION
            SELECT ancestor->>'id' FROM matched, jsonb_array_elements(path) ancestor
          ), siblings AS (
            SELECT b.*, NOT EXISTS(SELECT 1 FROM matched m WHERE m.id=b.id) AS context,
              EXISTS(SELECT 1 FROM base child JOIN relevant r ON r.id=child.id WHERE child.parent_id=b.id) AS has_children,
              row_number() OVER(PARTITION BY parent_id ORDER BY ${order}, b.id) AS sibling
            FROM base b JOIN relevant r ON r.id=b.id
          ), nodes AS (
            SELECT s.*, has_children AND (context OR
              EXISTS(SELECT 1 FROM matched m, jsonb_array_elements(m.path) p WHERE m.id=$10 AND p->>'id'=s.id)
              OR CASE WHEN $2<>'' THEN NOT(id=ANY($9::text[])) ELSE id=ANY($8::text[]) END) AS expanded
            FROM siblings s
          ), tree AS (
            SELECT n.*, 0 AS depth, ARRAY[sibling] AS position
            FROM nodes n WHERE parent_id IS NULL OR NOT EXISTS(SELECT 1 FROM nodes p WHERE p.id=n.parent_id)
            UNION ALL
            SELECT n.*, t.depth+1, t.position || n.sibling
            FROM tree t JOIN nodes n ON n.parent_id=t.id WHERE t.expanded AND t.depth<15
          ), numbered AS MATERIALIZED (
            SELECT *, row_number() OVER(ORDER BY position) AS ordinal FROM tree
          ), totals AS (
            SELECT count(*)::int AS total,
              coalesce((SELECT ((ordinal-1)/$7::int)::int+1 FROM numbered WHERE id=$10), $6::int) AS requested
            FROM numbered
          ), bounds AS (
            SELECT total, greatest(1,least(requested,greatest(1,ceil(total::numeric/$7::int)::int))) AS page FROM totals
          ), page_rows AS MATERIALIZED (
            SELECT n.* FROM numbered n CROSS JOIN bounds b
            WHERE ordinal>(b.page-1)*$7::int AND ordinal<=b.page*$7::int
          ), boundary AS (
            SELECT n.* FROM numbered n
            WHERE n.id IN (SELECT p->>'id' FROM jsonb_array_elements((SELECT path FROM page_rows ORDER BY ordinal LIMIT 1)) p)
              AND NOT EXISTS(SELECT 1 FROM page_rows r WHERE r.id=n.id)
            ORDER BY ordinal LIMIT 16
          ), returned AS (
            SELECT *, false AS boundary_context FROM page_rows
            UNION ALL SELECT *, true AS boundary_context FROM boundary
          )
          SELECT b.total,b.page,
            (SELECT jsonb_build_object('all',count(*),'active',count(*) FILTER(WHERE NOT archived),'inactive',count(*) FILTER(WHERE archived)) FROM filtered WHERE matches_filters) AS status_counts,
            coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY ordinal) FROM returned r),'[]'::jsonb) AS rows
          FROM bounds b
        `,
            [
              workspaceId,
              query.search,
              query.status,
              query.visibility,
              query.usage,
              query.page,
              query.pageSize,
              query.expanded,
              query.collapsed,
              query.reveal ?? null,
            ],
          )
        ).rows[0];
        const rows: CategoryManagementPage['rows'] = result.rows.map((row: any) => ({
          category: categoryDTO(row),
          depth: row.depth,
          context: row.context || row.boundary_context,
          hasChildren: row.has_children,
          expanded: row.expanded,
        }));
        return {
          rows,
          categories: rows.map((row) => row.category),
          counts: result.rows.map((row: any) => ({
            categoryId: row.id,
            direct: Number(row.direct),
            subtree: Number(row.subtree),
            publishedDirect: Number(row.published_direct),
            publishedSubtree: Number(row.published_subtree),
          })),
          total: result.total,
          page: result.page,
          pageSize: query.pageSize,
          statusCounts: result.status_counts,
        };
      });
    },
    async listCatalogPage(
      actor: Actor,
      workspaceId: string,
      input: CatalogManagementQuery,
    ): Promise<CatalogManagementPage> {
      const query = catalogManagementQuerySchema.parse(input);
      return transaction(actor, workspaceId, async (client) => {
        const result = (
          await client.query(
            `
          WITH usage AS (
            SELECT * FROM app.catalog_usage_counts($1)
          ), filtered AS MATERIALIZED (
            SELECT i.*, coalesce(u.draft_guides,0) AS draft_guides,coalesce(u.published_guides,0) AS published_guides,coalesce(u.distinct_guides,0) AS distinct_guides
            FROM app.catalog_item i LEFT JOIN usage u ON u.item_id=i.id
            WHERE i.workspace_id=$1
              AND strpos(app.normalized_name(i.name || ' ' || i.specification || ' ' || i.manufacturer || ' ' || i.model || ' ' || i.part_number), app.normalized_name($2))>0
              AND ($4='all' OR i.visibility=$4)
              AND ($5='all' OR ($5='used')=(coalesce(u.distinct_guides,0)>0))
          ), numbered AS MATERIALIZED (
            SELECT *, row_number() OVER(ORDER BY ${catalogSort[query.sort]} ${direction(query.direction)}${query.sort === 'name' ? '' : ', app.management_sort_key(name) ASC'},id) AS ordinal
            FROM filtered WHERE ${statusPredicate}
          ), totals AS (
            SELECT count(*)::int AS total,coalesce((SELECT ((ordinal-1)/$7::int)::int+1 FROM numbered WHERE id=$8),$6::int) AS requested FROM numbered
          ), bounds AS (
            SELECT total,greatest(1,least(requested,greatest(1,ceil(total::numeric/$7::int)::int))) AS page FROM totals
          )
          SELECT total,page,
            (SELECT jsonb_build_object('all',count(*),'active',count(*) FILTER(WHERE NOT archived),'inactive',count(*) FILTER(WHERE archived)) FROM filtered) AS status_counts,
            coalesce((SELECT jsonb_agg(to_jsonb(n) ORDER BY ordinal) FROM numbered n WHERE ordinal>(b.page-1)*$7::int AND ordinal<=b.page*$7::int),'[]'::jsonb) AS rows
          FROM bounds b
        `,
            [
              workspaceId,
              query.search,
              query.status,
              query.visibility,
              query.usage,
              query.page,
              query.pageSize,
              query.reveal ?? null,
            ],
          )
        ).rows[0];
        return {
          items: result.rows.map(catalogDTO),
          usage: result.rows.map((row: any) => ({
            itemId: row.id,
            draftGuides: Number(row.draft_guides),
            publishedGuides: Number(row.published_guides),
            distinctGuides: Number(row.distinct_guides),
          })),
          total: result.total,
          page: result.page,
          pageSize: query.pageSize,
          statusCounts: result.status_counts,
        };
      });
    },
  };
}
