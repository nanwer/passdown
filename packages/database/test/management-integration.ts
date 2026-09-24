import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { Actor } from '@guide/core';
import { toStructuredDocument, type GuideDocument } from '@guide/content';
import {
  categoryManagementQuerySchema,
  updateCategorySchema,
  updateCatalogItemSchema,
  catalogManagementQuerySchema,
  type Category,
  type CatalogItem,
} from '@guide/contracts';
import { createApplicationStore } from '../src/store';

export async function managementChecks({
  store,
  owner,
  check,
  actor,
  doc,
}: {
  store: ReturnType<typeof createApplicationStore>;
  owner: pg.Pool;
  check: (name: string, run: () => Promise<void>) => Promise<void>;
  actor: (id: string) => Actor;
  doc: GuideDocument;
}) {
  const w = 'management-paging';
  await owner.query(
    "INSERT INTO app.workspace(id,name,audience) VALUES($1,'Management paging','public')",
    [w],
  );
  await owner.query(
    "INSERT INTO app.membership(workspace_id,actor_id,role,active) VALUES($1,'owner','manage',true),($1,'reader','view',true)",
    [w],
  );
  const who = actor('owner');
  const categories: Category[] = [];
  const items: CatalogItem[] = [];
  const root = await store.createCategory(who, w, {
    domain: 'guide',
    name: 'Board',
    parentId: null,
    visibility: 'public',
    description: '',
    sortOrder: 0,
  });
  for (let index = 1; index <= 60; index++) {
    let category = await store.createCategory(who, w, {
      domain: 'guide',
      name: `Component ${index}`,
      parentId: root.id,
      visibility: index % 2 ? 'public' : 'members',
      description: '',
      sortOrder: 0,
    });
    let item = await store.createCatalogItem(who, w, {
      name: `Component ${index}`,
      specification: `Size ${index}`,
      manufacturer: index % 2 ? 'Brand A' : 'Brand B',
      model: `Model ${index}`,
      partNumber: `P-${index}`,
      defaultUnit: index % 2 ? 'each' : 'm',
      visibility: index % 2 ? 'public' : 'members',
      description: '',
    });
    if (index > 55) {
      category = await store.updateCategory(who, w, category.id, {
        ...updateCategorySchema.strip().parse({ ...category, expectedVersion: category.version }),
        expectedVersion: category.version,
        archived: true,
      });
      item = await store.updateCatalogItem(who, w, item.id, {
        ...updateCatalogItemSchema.strip().parse({ ...item, expectedVersion: item.version }),
        expectedVersion: item.version,
        archived: true,
      });
    }
    categories.push(category);
    items.push(item);
  }
  const cq = (input: Record<string, unknown> = {}) => categoryManagementQuerySchema.parse(input);
  const iq = (input: Record<string, unknown> = {}) => catalogManagementQuerySchema.parse(input);
  await check(
    'management sorting: equal values retain natural name order across pages in both directions',
    async () => {
      for (const direction of ['ascending', 'descending'] as const) {
        const expected = [
          ...items.filter(
            (item) => item.manufacturer === (direction === 'ascending' ? 'Brand A' : 'Brand B'),
          ),
          ...items.filter(
            (item) => item.manufacturer === (direction === 'ascending' ? 'Brand B' : 'Brand A'),
          ),
        ].map((item) => item.id);
        const found: string[] = [];
        for (const page of [1, 2, 3]) {
          const result = await store.listCatalogPage(
            who,
            w,
            iq({ status: 'all', sort: 'manufacturer', direction, page }),
          );
          found.push(...result.items.map((item) => item.id));
        }
        assert.deepEqual(found, expected);
        const tree = await store.listCategoryPage(
          who,
          w,
          cq({ status: 'all', sort: 'guides', direction, expanded: [root.id] }),
        );
        assert.deepEqual(
          tree.rows.slice(1).map((row) => row.category.id),
          categories.slice(0, 24).map((category) => category.id),
        );
      }
    },
  );
  await check(
    'management paging: SQL bounds catalog pages, numeric sorting, reveal and shrinking last page',
    async () => {
      const first = await store.listCatalogPage(who, w, iq({ status: 'all' }));
      const second = await store.listCatalogPage(who, w, iq({ status: 'all', page: 2 }));
      const last = await store.listCatalogPage(who, w, iq({ status: 'all', page: 999 }));
      assert.equal(first.items.length, 25);
      assert.equal(second.items.length, 25);
      assert.equal(last.items.length, 10);
      assert.equal(first.total, 60);
      assert.equal(last.page, 3);
      assert.deepEqual(
        first.items.map((i) => i.id),
        items.slice(0, 25).map((i) => i.id),
      );
      assert.equal(
        new Set([...first.items, ...second.items, ...last.items].map((i) => i.id)).size,
        60,
      );
      const reveal = await store.listCatalogPage(
        who,
        w,
        iq({ status: 'all', reveal: items[52].id }),
      );
      assert.equal(reveal.page, 3);
      assert(reveal.items.some((i) => i.id === items[52].id));
      const descending = await store.listCatalogPage(
        who,
        w,
        iq({ status: 'all', sort: 'partNumber', direction: 'descending' }),
      );
      assert.equal(descending.items[0].id, items[59].id);
      const active = await store.listCatalogPage(who, w, iq({ page: 999, pageSize: 50 }));
      assert.equal(active.page, 2);
      assert.equal(active.items.length, 5);
      for (const item of items.slice(50, 55))
        await store.updateCatalogItem(who, w, item.id, {
          ...updateCatalogItemSchema.strip().parse({ ...item, expectedVersion: item.version }),
          expectedVersion: item.version,
          archived: true,
        });
      const clamped = await store.listCatalogPage(who, w, iq({ page: 2, pageSize: 50 }));
      assert.equal(clamped.page, 1);
      assert.equal(clamped.total, 50);
      assert.equal(clamped.items.length, 50);
    },
  );
  await check(
    'management paging: tree page boundaries retain ancestors, expansion and reveal preserve sibling order',
    async () => {
      const closed = await store.listCategoryPage(who, w, cq({ status: 'all' }));
      assert.equal(closed.rows.length, 1);
      assert.equal(closed.total, 1);
      assert.equal(closed.statusCounts.all, 61);
      const first = await store.listCategoryPage(
        who,
        w,
        cq({ status: 'all', expanded: [root.id] }),
      );
      const second = await store.listCategoryPage(
        who,
        w,
        cq({ status: 'all', expanded: [root.id], page: 2 }),
      );
      assert.equal(first.total, 61);
      assert.equal(first.rows.length, 25);
      assert.equal(second.rows.length, 26);
      assert.equal(second.rows[0].category.id, root.id);
      assert(second.rows[0].context);
      assert.deepEqual(
        second.rows.slice(1).map((r) => r.category.id),
        categories.slice(24, 49).map((c) => c.id),
      );
      assert(second.rows.slice(1).every((r) => r.depth === 1));
      const reveal = await store.listCategoryPage(
        who,
        w,
        cq({ status: 'all', reveal: categories[55].id }),
      );
      assert.equal(reveal.page, 3);
      assert(reveal.rows.some((r) => r.category.id === categories[55].id));
      const searched = await store.listCategoryPage(who, w, cq({ status: 'all', search: 'Board' }));
      assert.equal(searched.total, 61);
      assert(searched.rows[0].expanded);
      const collapsed = await store.listCategoryPage(
        who,
        w,
        cq({ status: 'all', search: 'Board', collapsed: [root.id] }),
      );
      assert.equal(collapsed.total, 1);
      assert.equal(collapsed.statusCounts.all, 61);
      const code = await store.listCategoryPage(who, w, cq({ search: categories[5].code }));
      assert.equal(code.statusCounts.all, 1);
      assert.equal(code.rows.at(-1)?.category.id, categories[5].id);
    },
  );
  const draft = await store.createDraft(who, w, {
    document: doc,
    categoryId: categories[0].id,
    audience: 'members',
  });
  await owner.query(
    'INSERT INTO app.guide_requirement_reference(workspace_id,guide_id,requirement_id,item_id,item_version) VALUES($1,$2,$3,$4,1),($1,$2,$5,$4,1)',
    [w, draft.id, randomUUID(), items[0].id, randomUUID()],
  );
  await check(
    'management paging: combined filters narrow status counts before status, with scoped distinct usage',
    async () => {
      const catalog = await store.listCatalogPage(
        who,
        w,
        iq({ search: 'Brand A', visibility: 'public', usage: 'unused', status: 'inactive' }),
      );
      assert.equal(catalog.total, 5);
      assert.deepEqual(catalog.statusCounts, { all: 29, active: 24, inactive: 5 });
      assert(catalog.items.every((i) => i.visibility === 'public' && i.archived));
      const used = await store.listCatalogPage(who, w, iq({ usage: 'used' }));
      assert.equal(used.total, 1);
      assert.equal(used.usage[0].distinctGuides, 1);
      assert.equal(used.usage[0].draftGuides, 1);
      const things = await store.listCategoryPage(
        who,
        w,
        cq({ search: 'Component', visibility: 'members', status: 'inactive' }),
      );
      assert.deepEqual(things.statusCounts, { all: 30, active: 27, inactive: 3 });
      assert.equal(things.rows.length, 4);
      assert(things.rows[0].context);
      const usedThings = await store.listCategoryPage(
        who,
        w,
        cq({ usage: 'used', expanded: [root.id] }),
      );
      assert.equal(usedThings.statusCounts.all, 2);
      assert.equal(usedThings.counts.find((c) => c.categoryId === root.id)?.subtree, 1);
      const numeric = await store.listCategoryPage(
        who,
        w,
        cq({ search: 'Component', sort: 'guides', direction: 'descending' }),
      );
      assert.equal(numeric.rows[1].category.id, categories[0].id);
    },
  );
  await check(
    'management paging: private records and guide usage cannot leak through totals, contexts, or reveal',
    async () => {
      for (const visitor of [{ kind: 'anonymous' } as Actor, actor('outsider')]) {
        const things = await store.listCategoryPage(
          visitor,
          w,
          cq({ status: 'all', search: 'Board', reveal: categories[1].id }),
        );
        assert.equal(things.statusCounts.all, 31);
        assert.equal(things.total, 31);
        assert.equal(things.page, 1);
        assert(things.categories.every((c) => c.visibility === 'public'));
        assert(things.counts.every((c) => c.direct === 0 && c.subtree === 0));
        const catalog = await store.listCatalogPage(
          visitor,
          w,
          iq({ status: 'all', reveal: items[1].id }),
        );
        assert.equal(catalog.total, 30);
        assert.equal(catalog.page, 1);
        assert(catalog.usage.every((u) => u.distinctGuides === 0));
        assert.equal((await store.listCatalogPage(visitor, w, iq({ usage: 'used' }))).total, 0);
        assert.equal((await store.listCategoryPage(visitor, 'private', cq())).total, 0);
      }
      const reader = await store.listCatalogPage(actor('reader'), w, iq({ usage: 'used' }));
      assert.equal(reader.total, 0);
      const empty = await store.listCategoryPage(
        who,
        w,
        cq({ search: 'does not exist', page: 999 }),
      );
      assert.equal(empty.total, 0);
      assert.equal(empty.page, 1);
      assert.deepEqual(empty.rows, []);
      const other = await store.listCategoryPage(who, 'public', cq({ reveal: root.id }));
      assert(!other.categories.some((c) => c.workspaceId === w));
    },
  );
  await check(
    'management usage: readable publications count for viewers while unpublished and internal references stay scoped',
    async () => {
      const i = items[0];
      for (const audience of ['public', 'members'] as const) {
        const document = {
          ...toStructuredDocument(doc),
          requirements: [
            {
              id: randomUUID(),
              itemId: i.id,
              itemVersion: i.version,
              role: 'keep' as const,
              name: i.name,
              specification: i.specification,
              description: i.description,
              manufacturer: i.manufacturer,
              model: i.model,
              partNumber: i.partNumber,
              quantity: 1,
              unit: i.defaultUnit,
              optional: false,
              notes: '',
            },
          ],
        };
        const guide = await store.createDraft(who, w, {
          document,
          categoryId: categories[0].id,
          audience,
        });
        await store.publishDraft(who, w, guide.id, {
          expectedVersion: 1,
          expectedPublicationRevision: 0,
          expectedRelease: null,
          license: 'all-rights-reserved',
        });
      }
      for (const [viewer, expected] of [
        [{ kind: 'anonymous' } as Actor, 1],
        [actor('outsider'), 1],
        [actor('reader'), 2],
      ] as const) {
        const page = await store.listCatalogPage(viewer, w, iq({ usage: 'used' }));
        assert.equal(page.total, 1);
        assert.equal(page.usage[0].draftGuides, 0);
        assert.equal(page.usage[0].publishedGuides, expected);
        assert.equal(page.usage[0].distinctGuides, expected);
        const legacy = (await store.listCatalogUsage(viewer, w)).find((u) => u.itemId === i.id)!;
        assert.deepEqual(legacy, page.usage[0]);
        const categoryCounts = (await store.listCategoryCounts(viewer, w, 'guide')).find(
          (c) => c.categoryId === categories[0].id,
        )!;
        assert.equal(categoryCounts.direct, 0);
        assert.equal(categoryCounts.publishedDirect, expected);
        const usedThings = await store.listCategoryPage(
          viewer,
          w,
          cq({ usage: 'used', expanded: [root.id] }),
        );
        assert.equal(usedThings.statusCounts.all, 2);
        assert(usedThings.categories.some((c) => c.id === categories[0].id));
      }
      const manager = await store.listCatalogPage(who, w, iq({ usage: 'used' }));
      assert.equal(manager.usage[0].distinctGuides, 3);
      assert.equal(manager.usage[0].draftGuides, 3);
      assert.equal(manager.usage[0].publishedGuides, 2);
    },
  );
}
