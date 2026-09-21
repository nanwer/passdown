import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import type { Actor } from '@guide/core';
import { toStructuredDocument, type GuideDocument, type GuideRequirement } from '@guide/content';
import type { Category, CatalogItem } from '@guide/contracts';
import { createApplicationStore } from '../src/store';
type Store = ReturnType<typeof createApplicationStore>;
export async function structuredChecks({
  store,
  owner,
  check,
  scoped,
  actor,
  anonymous,
  doc,
}: {
  store: Store;
  owner: pg.Pool;
  runtime: pg.Pool;
  check: (name: string, fn: () => Promise<void>) => Promise<void>;
  scoped: <T>(who: Actor, w: string, fn: (c: pg.PoolClient) => Promise<T>) => Promise<T>;
  actor: (id: string, active?: boolean) => Actor;
  anonymous: Actor;
  doc: GuideDocument;
}) {
  const who = actor('owner');
  const category = (
    name: string,
    parentId: string | null = null,
    domain: 'guide' | 'tool' | 'material' = 'guide',
    visibility: 'public' | 'members' = 'public',
    workspace = 'public',
  ) =>
    store.createCategory(who, workspace, {
      name,
      parentId,
      domain,
      visibility,
      description: '',
      sortOrder: 0,
    });
  const edit = (c: Category, changes: Partial<Category>) =>
    store.updateCategory(who, c.workspaceId, c.id, {
      domain: c.domain,
      parentId: c.parentId,
      name: c.name,
      description: c.description,
      visibility: c.visibility,
      sortOrder: c.sortOrder,
      archived: c.archived,
      expectedVersion: c.version,
      ...changes,
    });
  const item = (
    name: string,
    role: 'keep' | 'use' = 'keep',
    workspace = 'public',
    visibility: 'public' | 'members' = 'public',
  ) =>
    store.createCatalogItem(who, workspace, {
      name,
      visibility,
      specification: role === 'keep' ? 'Phillips #00' : 'M2 × 4 mm',
      description: 'Exact test specification',
      manufacturer: '',
      model: '',
      partNumber: '',
      defaultUnit: 'each',
    });
  const editItem = (i: CatalogItem, changes: Partial<CatalogItem>) =>
    store.updateCatalogItem(who, i.workspaceId, i.id, {
      name: i.name,
      visibility: i.visibility,
      specification: i.specification,
      description: i.description,
      manufacturer: i.manufacturer,
      model: i.model,
      partNumber: i.partNumber,
      defaultUnit: i.defaultUnit,
      archived: i.archived,
      expectedVersion: i.version,
      ...changes,
    });
  const denied = (promise: Promise<unknown>, status = 422) =>
    assert.rejects(promise, (e: any) => e.status === status);
  const requirement = (
    i: CatalogItem,
    role: GuideRequirement['role'] = 'keep',
  ): GuideRequirement => ({
    id: randomUUID(),
    itemId: i.id,
    itemVersion: i.version,
    role,
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
  });
  let root!: Category,
    leaf!: Category,
    other!: Category,
    restricted!: Category,
    elsewhere!: Category,
    driver!: CatalogItem,
    part!: CatalogItem;
  await check(
    'taxonomy: empty public categories, deep parent paths and restricted names obey actual RLS',
    async () => {
      root = await category('Equipment');
      other = await category('Household equipment');
      leaf = root;
      for (const name of ['Computers', 'Laptops', 'Example brand', 'Example model'])
        leaf = await category(name, leaf.id);
      restricted = await category('Secret prototype', null, 'guide', 'members');
      assert.equal(leaf.path.length, 5);
      assert.deepEqual(
        leaf.path.map((p) => p.name),
        ['Equipment', 'Computers', 'Laptops', 'Example brand', 'Example model'],
      );
      assert((await store.listCategories(anonymous, 'public')).some((c) => c.id === root.id));
      assert(
        !(await store.listCategories(anonymous, 'public')).some((c) => c.id === restricted.id),
      );
      assert.deepEqual(await store.listCategories(anonymous, 'private'), []);
      assert.equal(await store.getCategory(anonymous, 'public', restricted.id), null);
      for (const outsider of [
        anonymous,
        actor('outsider'),
        actor('suspended'),
        actor('unverified'),
      ])
        await denied(
          store.createCategory(outsider, 'private', {
            name: 'No',
            domain: 'guide',
            parentId: null,
            visibility: 'members',
            description: '',
            sortOrder: 0,
          }),
          404,
        );
      await scoped(anonymous, 'public', async (c) => {
        assert.equal(
          (await c.query('SELECT * FROM app.category WHERE id=$1', [restricted.id])).rowCount,
          0,
        );
        assert.equal(
          (await c.query("SELECT * FROM app.category WHERE workspace_id='private'")).rowCount,
          0,
        );
      });
    },
  );
  await check(
    'taxonomy: normalized sibling duplicates, cross-domain/workspace links and depth bound reject atomically',
    async () => {
      await denied(category('  ＥＱＵＩＰＭＥＮＴ  '));
      await category('Example model', other.id);
      // Only one tree exists now, and the database refuses the other two
      // outright rather than letting a second hierarchy start.
      await assert.rejects(category('Hand tools', null, 'tool'));
      await assert.rejects(category('Fasteners', null, 'material'));
      elsewhere = await category('Another workspace', null, 'guide', 'members', 'private');
      const secret = await category('Private machines', null, 'guide', 'members', 'private');
      await denied(category('Wrong scope', secret.id));
      await denied(category('Exposed child', restricted.id));
      let deep = await category('Depth limit');
      for (let i = 2; i <= 16; i++) deep = await category(`Level ${i}`, deep.id);
      await denied(category('Level 17', deep.id));
      assert.equal(deep.path.length, 16);
      await denied(edit(root, { parentId: leaf.id }));
      assert.equal((await store.getCategory(who, 'public', root.id))?.parentId, null);
    },
  );
  await check(
    'taxonomy: competing structural moves serialize and stale edits conflict',
    async () => {
      const a = await category('Concurrent branch A'),
        b = await category('Concurrent branch B');
      const results = await Promise.allSettled([
        edit(a, { parentId: b.id }),
        edit(b, { parentId: a.id }),
      ]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
      const current = (await store.getCategory(who, 'public', root.id))!;
      await edit(current, { description: 'Changed' });
      await denied(edit(current, { description: 'Stale' }), 409);
      root = (await store.getCategory(who, 'public', root.id))!;
    },
  );
  let guideId = '';
  await check(
    'taxonomy: publication assignment is frozen until republish; current navigation follows branch moves',
    async () => {
      const draft = await store.createDraft(who, 'public', {
        document: doc,
        categoryId: leaf.id,
        audience: 'public',
      });
      guideId = draft.id;
      await store.publishDraft(who, 'public', draft.id, {
        expectedVersion: 1,
        expectedRelease: null,
        license: 'all-rights-reserved',
      });
      assert(
        (await store.listReleases(anonymous, 'public', { categoryId: root.id })).guides.some(
          (g) => g.id === draft.id,
        ),
      );
      await store.saveDraft(who, 'public', draft.id, {
        expectedVersion: 1,
        document: draft.document,
        categoryId: other.id,
      });
      assert.equal((await store.getRelease(anonymous, 'public', draft.id))?.categoryId, leaf.id);
      leaf = await edit(leaf, { name: 'Renamed model', parentId: other.id });
      assert(
        (await store.listReleases(anonymous, 'public', { categoryId: other.id })).guides.some(
          (g) => g.id === draft.id,
        ),
      );
      const historic = (
        await owner.query(
          'SELECT category_path,document FROM app.release WHERE guide_id=$1 AND number=1',
          [draft.id],
        )
      ).rows[0];
      assert.equal(historic.category_path.at(-1).name, 'Example model');
      assert.equal(historic.document.title, doc.title);
      await denied(edit(leaf, { visibility: 'members' }));
      await denied(edit(leaf, { archived: true }));
      await denied(edit(other, { archived: true }));
      const unused = await category('Unused category');
      await edit(unused, { archived: true });
      assert(!(await store.listCategories(who, 'public')).some((c) => c.id === unused.id));
      assert(
        (await store.listCategories(who, 'public', { includeArchived: true })).some(
          (c) => c.id === unused.id,
        ),
      );
      const restrictedDraft = await store.createDraft(who, 'public', {
        document: doc,
        categoryId: restricted.id,
        audience: 'public',
      });
      await denied(
        store.publishDraft(who, 'public', restrictedDraft.id, {
          expectedVersion: 1,
          expectedRelease: null,
          license: 'all-rights-reserved',
        }),
      );
    },
  );
  await check(
    'taxonomy codes: assigned per domain, editable only at creation, stable across rename and move',
    async () => {
      const all = await store.listCategories(who, 'public', { includeArchived: true });
      assert(all.every((c) => /^[A-Z]{2}-\d{4}$/.test(c.code)));
      const perDomain = new Map<string, Set<string>>();
      for (const c of all) {
        const seen = perDomain.get(c.domain) ?? new Set<string>();
        assert(!seen.has(c.code), `duplicate code ${c.code} in ${c.domain}`);
        seen.add(c.code);
        perDomain.set(c.domain, seen);
      }
      // Domains number independently, so a guide and a tool category never collide.
      assert((await store.proposeCategoryCode(who, 'public', 'tool')).startsWith('TC-'));

      // A caller-supplied code is honoured and normalized to upper case.
      const chosen = await store.createCategory(who, 'public', {
        name: 'Coded branch',
        parentId: null,
        domain: 'guide',
        visibility: 'public',
        description: '',
        sortOrder: 0,
        code: 'fridge-lg',
      });
      assert.equal(chosen.code, 'FRIDGE-LG');

      // The same code cannot be taken twice within a domain, and the failure
      // names the field rather than surfacing a database constraint.
      await denied(
        store.createCategory(who, 'public', {
          name: 'Duplicate code',
          parentId: null,
          domain: 'guide',
          visibility: 'public',
          description: '',
          sortOrder: 0,
          code: 'FRIDGE-LG',
        }),
      );

      // Renaming and re-parenting leave identity and code untouched.
      const moved = await edit(chosen, { name: 'Renamed branch', parentId: root.id });
      assert.equal(moved.code, 'FRIDGE-LG');
      assert.equal(moved.id, chosen.id);
    },
  );
  await check(
    'taxonomy counts: distinct guides roll up through the subtree and separate draft from published',
    async () => {
      const counts = new Map(
        (await store.listCategoryCounts(who, 'public', 'guide')).map((c) => [c.categoryId, c]),
      );
      const at = (id: string) =>
        counts.get(id) ?? {
          categoryId: id,
          direct: 0,
          subtree: 0,
          publishedDirect: 0,
          publishedSubtree: 0,
        };

      // The earlier taxonomy check left this guide's draft under `other` while
      // its published release stayed on `leaf`, which is now a child of `other`.
      assert(at(other.id).direct >= 1, 'a draft assignment counts against its own category');
      assert(at(leaf.id).publishedDirect >= 1, 'a release counts against the release category');
      assert(
        at(other.id).publishedSubtree > at(other.id).publishedDirect,
        'a parent rolls up published releases held by its children',
      );
      for (const c of counts.values()) {
        assert(c.subtree >= c.direct, `${c.categoryId}: subtree must include direct`);
        assert(c.publishedSubtree >= c.publishedDirect);
      }

      // A signed-out reader never learns about restricted branches through totals.
      const publicCounts = await store.listCategoryCounts(anonymous, 'public', 'guide');
      assert(!publicCounts.some((c) => c.categoryId === restricted.id));
    },
  );
  await check(
    'taxonomy deactivation: current assignments block, a superseded release does not',
    async () => {
      const from = await category('Retiring branch');
      const to = await category('Replacement branch');
      const draft = await store.createDraft(who, 'public', {
        document: doc,
        categoryId: from.id,
        audience: 'public',
      });
      await store.publishDraft(who, 'public', draft.id, {
        expectedVersion: 1,
        expectedRelease: null,
        license: 'all-rights-reserved',
      });

      // While the current release sits here, the blockers report it and
      // archiving is refused.
      const blocked = await store.categoryBlockers(who, 'public', from.id);
      assert.equal(blocked.currentReleases, 1);
      assert.equal(blocked.assignedGuides, 1);
      await denied(edit((await store.getCategory(who, 'public', from.id))!, { archived: true }));

      // Move the draft and republish, so the first release becomes superseded.
      const current = (await store.getDraft(who, 'public', draft.id))!;
      await store.saveDraft(who, 'public', draft.id, {
        expectedVersion: current.version,
        document: current.document,
        categoryId: to.id,
      });
      const moved = (await store.getDraft(who, 'public', draft.id))!;
      await store.publishDraft(who, 'public', draft.id, {
        expectedVersion: moved.version,
        expectedRelease: 1,
        license: 'all-rights-reserved',
      });

      // Only history points at the old branch now, so it can be retired.
      const after = await store.categoryBlockers(who, 'public', from.id);
      assert.equal(after.assignedGuides, 0);
      assert.equal(after.currentReleases, 0);
      const archived = await edit((await store.getCategory(who, 'public', from.id))!, {
        archived: true,
      });
      assert.equal(archived.archived, true);

      // The superseded release keeps its own frozen reference.
      const historic = (
        await owner.query('SELECT category_id FROM app.release WHERE guide_id=$1 AND number=1', [
          draft.id,
        ])
      ).rows[0];
      assert.equal(historic.category_id, from.id);

      // The branch now holding the current release is still protected.
      await denied(edit((await store.getCategory(who, 'public', to.id))!, { archived: true }));
    },
  );
  await check(
    'catalog: exact variants, searchable descendant categories, duplicate identifiers and wrong domains',
    async () => {
      driver = await item('Small screwdriver');
      part = await item('Replacement screw', 'use');
      const driver0 = await item('Other screwdriver');
      await editItem(driver0, { specification: 'Phillips #0' });
      // Searching an exact specification is what the catalog is for; two
      // screwdrivers of the same name differ only by that.
      assert.equal((await store.listCatalogItems(who, 'public', { search: '#00' })).length, 1);
      driver = await editItem(driver, { manufacturer: 'Maker', partNumber: 'DR-00' });
      const otherDriver = await item('Duplicate identifier candidate');
      await denied(editItem(otherDriver, { manufacturer: ' maker ', partNumber: 'dr-00' }));
      // An item may now carry any unit. "Counted in whole each or pair" was a
      // rule about keeping something, and it moved to the guide's role with the
      // rest of the distinction; the document schema enforces it there.
      driver = await editItem(driver, { defaultUnit: 'ml' });
      assert.equal(driver.defaultUnit, 'ml');
      driver = await editItem(driver, { defaultUnit: 'each' });
      const stale = driver;
      driver = await editItem(driver, { description: 'Revision two' });
      await denied(editItem(stale, { description: 'Overwrite' }), 409);
    },
  );
  let selected: GuideRequirement,
    selectedDocument: ReturnType<typeof toStructuredDocument>,
    selectedDraft: any;
  await check(
    'catalog: frozen item versions validate snapshots, workspace isolation and forged data',
    async () => {
      selected = requirement(driver);
      selectedDocument = { ...toStructuredDocument(doc), requirements: [selected] };
      selectedDraft = await store.createDraft(who, 'public', {
        document: selectedDocument,
        categoryId: leaf.id,
        audience: 'public',
      });
      await denied(
        store.createDraft(who, 'public', {
          document: { ...selectedDocument, requirements: [{ ...selected, name: 'Forged' }] },
          categoryId: leaf.id,
          audience: 'public',
        }),
      );
      const privateItem = await item('Secret torque tool', 'keep', 'private', 'members');
      await denied(
        store.createDraft(who, 'public', {
          document: { ...selectedDocument, requirements: [requirement(privateItem)] },
          categoryId: leaf.id,
          audience: 'public',
        }),
      );
      assert.equal(await store.getCatalogItem(anonymous, 'private', privateItem.id), null);
      assert.deepEqual(
        await store.listCatalogItems(anonymous, 'private', { search: 'Secret' }),
        [],
      );
      await denied(store.getCatalogUsage(actor('outsider'), 'public', driver.id), 404);
      await store.publishDraft(who, 'public', selectedDraft.id, {
        expectedVersion: 1,
        expectedRelease: null,
        license: 'all-rights-reserved',
      });
      driver = await editItem(driver, { specification: 'Phillips #00 updated description' });
      const release = (await store.getRelease(anonymous, 'public', selectedDraft.id))!;
      assert.equal(release.document.schemaVersion, 5);
      if (release.document.schemaVersion === 5)
        assert.equal(release.document.requirements[0]?.specification, selected.specification);
      await store.saveDraft(who, 'public', selectedDraft.id, {
        expectedVersion: 1,
        document: selectedDocument,
        categoryId: leaf.id,
      });
      assert(
        (await store.getCatalogUsage(who, 'public', driver.id)).guides.some(
          (g) => g.id === selectedDraft.id,
        ),
      );
    },
  );
  await check(
    'catalog: archive preserves existing references, blocks new selection and public-reference concealment',
    async () => {
      driver = await editItem(driver, { archived: true });
      assert(!(await store.listCatalogItems(who, 'public')).some((i) => i.id === driver.id));
      assert(
        (await store.listCatalogItems(who, 'public', { includeArchived: true })).some(
          (i) => i.id === driver.id,
        ),
      );
      await denied(
        store.createDraft(who, 'public', {
          document: selectedDocument,
          categoryId: leaf.id,
          audience: 'public',
        }),
      );
      await store.saveDraft(who, 'public', selectedDraft.id, {
        expectedVersion: 2,
        document: selectedDocument,
        categoryId: leaf.id,
      });
      await store.publishDraft(who, 'public', selectedDraft.id, {
        expectedVersion: 3,
        expectedRelease: 1,
        license: 'all-rights-reserved',
      });
      // Restricting the item itself is still refused while a public release
      // depends on it. The category half of this check went with the item
      // trees: an item's visibility is now its own, not inherited.
      await denied(editItem(driver, { visibility: 'members' }));
      assert.equal((await store.getRelease(anonymous, 'public', selectedDraft.id))?.release, 2);
      await scoped(who, 'public', async (c) => {
        await assert.rejects(
          c.query("UPDATE app.catalog_item_version SET snapshot='{}' WHERE item_id=$1", [
            driver.id,
          ]),
        );
      });
    },
  );
  await check(
    'catalog: making an item public does not expose a previously restricted version',
    async () => {
      const privateVersion = await item('Initially restricted item', 'keep', 'public', 'members');
      const document = {
        ...toStructuredDocument(doc),
        requirements: [requirement(privateVersion)],
      };
      const draft = await store.createDraft(who, 'public', {
        document,
        categoryId: leaf.id,
        audience: 'public',
      });
      const publicVersion = await editItem(privateVersion, {
        visibility: 'public',
        description: 'Deliberately public description',
      });
      await denied(
        store.publishDraft(who, 'public', draft.id, {
          expectedVersion: 1,
          expectedRelease: null,
          license: 'all-rights-reserved',
        }),
      );
      await store.saveDraft(who, 'public', draft.id, {
        expectedVersion: 1,
        document: { ...document, requirements: [requirement(publicVersion)] },
        categoryId: leaf.id,
      });
      await store.publishDraft(who, 'public', draft.id, {
        expectedVersion: 2,
        expectedRelease: null,
        license: 'all-rights-reserved',
      });
    },
  );
  await check(
    'structured publication: unresolved originals, broken step references and overallocated materials remain repairable drafts',
    async () => {
      const legacy = await store.createDraft(who, 'public', {
        document: { ...doc, tools: ['Original ambiguous preparation label'] },
        categoryId: leaf.id,
        audience: 'public',
      });
      assert.equal(legacy.document.schemaVersion, 5);
      if (legacy.document.schemaVersion === 5)
        assert.equal(
          legacy.document.unresolvedTools[0]?.label,
          'Original ambiguous preparation label',
        );
      await denied(
        store.publishDraft(who, 'public', legacy.id, {
          expectedVersion: 1,
          expectedRelease: null,
          license: 'all-rights-reserved',
        }),
      );
      const req = requirement(part, 'use'),
        base = toStructuredDocument(doc);
      const bad = {
        ...base,
        requirements: [req],
        steps: [
          {
            ...base.steps[0]!,
            requirements: [
              {
                requirementId: req.id,
                quantity: 2,
                unit: req.unit,
                mode: 'consume' as const,
                optional: false,
                notes: '',
              },
            ],
            earlierStepIds: [randomUUID()],
          },
        ],
      };
      const draft = await store.createDraft(who, 'public', {
        document: bad,
        categoryId: leaf.id,
        audience: 'public',
      });
      await denied(
        store.publishDraft(who, 'public', draft.id, {
          expectedVersion: 1,
          expectedRelease: null,
          license: 'all-rights-reserved',
        }),
      );
      const repaired = {
        ...bad,
        requirements: [{ ...req, quantity: 2 }],
        steps: [{ ...bad.steps[0]!, earlierStepIds: [] }],
      };
      await store.saveDraft(who, 'public', draft.id, {
        expectedVersion: 1,
        document: repaired,
        categoryId: leaf.id,
      });
      await store.publishDraft(who, 'public', draft.id, {
        expectedVersion: 2,
        expectedRelease: null,
        license: 'all-rights-reserved',
      });
    },
  );
  await check(
    'catalog usage: the bulk listing agrees with per-item usage and separates drafts from releases',
    async () => {
      const bulk = new Map(
        (await store.listCatalogUsage(who, 'public')).map((entry) => [entry.itemId, entry]),
      );
      const items = await store.listCatalogItems(who, 'public', { includeArchived: true });
      assert(items.length > 0, 'fixtures should leave catalog items behind');
      for (const item of items) {
        const detail = await store.getCatalogUsage(who, 'public', item.id);
        const counts = bulk.get(item.id) ?? {
          itemId: item.id,
          draftGuides: 0,
          publishedGuides: 0,
        };
        // The per-item query returns guides referenced by a draft or the
        // current release, so it is the union of the two bulk buckets.
        const union = new Set(detail.guides.map((g) => g.id));
        assert(
          counts.draftGuides <= union.size && counts.publishedGuides <= union.size,
          `${item.name}: bulk counts exceed the per-item guide list`,
        );
        assert(
          (counts.draftGuides > 0 || counts.publishedGuides > 0) === union.size > 0,
          `${item.name}: bulk and per-item disagree about whether anything uses it`,
        );
        const published = detail.guides.filter((g) => g.currentRelease !== null).length;
        assert(
          counts.publishedGuides <= published,
          `${item.name}: more published usage than guides with a current release`,
        );
      }

      // A signed-out reader cannot learn about restricted items through totals.
      const publicUsage = await store.listCatalogUsage(anonymous, 'public');
      const restrictedItems = items.filter((item) => item.visibility === 'members');
      for (const item of restrictedItems)
        assert(!publicUsage.some((entry) => entry.itemId === item.id));
    },
  );
  await check(
    'structured database boundary: direct cycles, wrong guide domains and suspended catalog writes cannot bypass service',
    async () => {
      await assert.rejects(
        scoped(who, 'public', (c) =>
          c.query('UPDATE app.category SET parent_id=id WHERE id=$1', [root.id]),
        ),
      );
      // A guide still cannot be repointed at a category from another
      // workspace, which is the scope rule the domain check used to ride on.
      await assert.rejects(
        scoped(who, 'public', (c) =>
          c.query('UPDATE app.guide SET category_id=$1 WHERE id=$2', [elsewhere.id, guideId]),
        ),
      );
      await denied(
        store.createCatalogItem(actor('suspended'), 'private', {
          name: 'No',
          visibility: 'members',
          specification: '',
          description: '',
          manufacturer: '',
          model: '',
          partNumber: '',
          defaultUnit: 'each',
        }),
        404,
      );
      await scoped(anonymous, 'public', async (c) => {
        assert.equal((await c.query('SELECT * FROM app.catalog_item_version')).rowCount, 0);
        assert.equal((await c.query('SELECT * FROM app.guide_requirement_reference')).rowCount, 0);
      });
    },
  );

  await check(
    'guide families: a readable trail, refused cycles and relatives concealed by audience',
    async () => {
      const section = await category(`Families ${randomUUID().slice(0, 8)}`);
      const make = async (title: string, audience: 'public' | 'members' = 'public') => {
        const created = await store.createDraft(who, 'public', {
          document: { ...doc, title },
          categoryId: section.id,
          audience,
        });
        await store.publishDraft(who, 'public', created.id, {
          expectedVersion: 1,
          expectedRelease: null,
          license: 'all-rights-reserved',
        });
        return created.id;
      };
      const range = await make('Fridge range');
      const model = await make('Fridge model');
      const revision = await make('Fridge revision');
      await store.setGuideParent(who, 'public', model, range);
      await store.setGuideParent(who, 'public', revision, model);

      const middle = await store.getGuideFamily(anonymous, 'public', model);
      assert.deepEqual(
        middle.ancestors.map((a) => a.title),
        ['Fridge range'],
      );
      assert.deepEqual(
        middle.children.map((c) => c.title),
        ['Fridge revision'],
      );
      // The trail reads top-down however deep the guide sits.
      assert.deepEqual(
        (await store.getGuideFamily(anonymous, 'public', revision)).ancestors.map((a) => a.title),
        ['Fridge range', 'Fridge model'],
      );

      // A guide cannot become its own ancestor, at any distance.
      await assert.rejects(store.setGuideParent(who, 'public', range, revision));
      await assert.rejects(
        store.setGuideParent(who, 'public', range, range),
        /its own broader guide/,
      );
      // Nor can a family cross a workspace boundary.
      await assert.rejects(store.setGuideParent(who, 'private', model, range));

      // Setting a parent replaces the old link rather than adding a second
      // route up, and clearing it leaves the guide readable on its own.
      await store.setGuideParent(who, 'public', revision, range);
      assert.deepEqual(
        (await store.getGuideFamily(anonymous, 'public', revision)).ancestors.map((a) => a.title),
        ['Fridge range'],
      );
      await store.setGuideParent(who, 'public', revision, null);
      assert.deepEqual(await store.getGuideFamily(anonymous, 'public', revision), {
        ancestors: [],
        children: [],
      });
      await store.setGuideParent(who, 'public', revision, model);

      // Depth is bounded so a walk either way stays cheap. Eight guides deep
      // is allowed; the ninth link is refused.
      const chain = [range, model, revision];
      for (let n = chain.length; n < 8; n += 1) {
        const next = await make(`Fridge depth ${n}`);
        await store.setGuideParent(who, 'public', next, chain[chain.length - 1]!);
        chain.push(next);
      }
      const overflow = await make('Fridge too deep');
      await assert.rejects(
        store.setGuideParent(who, 'public', overflow, chain[chain.length - 1]!),
        /8 levels/,
      );

      // A members-only relative leaves no trace for a visitor: not the link,
      // not a placeholder, and not a count.
      const internalRange = await make('Internal range', 'members');
      const publicChild = await make('Public child');
      await store.setGuideParent(who, 'public', publicChild, internalRange);
      assert.deepEqual(await store.getGuideFamily(anonymous, 'public', publicChild), {
        ancestors: [],
        children: [],
      });
      assert.deepEqual(
        (await store.getGuideFamily(who, 'public', publicChild)).ancestors.map((a) => a.title),
        ['Internal range'],
      );
      // And the reverse direction: the internal parent does not advertise a
      // public child to someone who cannot read the parent at all.
      assert.deepEqual(await store.getGuideFamily(anonymous, 'public', internalRange), {
        ancestors: [],
        children: [],
      });
      // Straight at the table, with no service code in the way.
      await scoped(anonymous, 'public', async (c) => {
        const rows = (
          await c.query('SELECT child_guide_id FROM app.guide_family WHERE parent_guide_id=$1', [
            internalRange,
          ])
        ).rowCount;
        assert.equal(rows, 0);
      });
    },
  );

  await check(
    'audience moves: a guide can change sections, and going public cannot expose what is not public',
    async () => {
      const suffix = randomUUID().slice(0, 8);
      const open = await category(`Open ${suffix}`);
      const closed = await category(`Closed ${suffix}`, null, 'guide', 'members');
      const publish = async (id: string, version = 1) =>
        store.publishDraft(who, 'public', id, {
          expectedVersion: version,
          expectedRelease: null,
          license: 'all-rights-reserved',
        });

      // Internal, published, referencing nothing restricted: the move out is
      // allowed and takes effect for the current release immediately.
      const internal = await store.createDraft(who, 'public', {
        document: { ...doc, title: `Internal to public ${suffix}` },
        categoryId: open.id,
        audience: 'members',
      });
      await publish(internal.id);
      assert.equal(await store.getRelease(anonymous, 'public', internal.id), null);
      assert.deepEqual(await store.guidePublicBlockers(who, 'public', internal.id), []);
      await store.setGuideAudience(who, 'public', internal.id, 'public', 1);
      assert.equal(
        (await store.getRelease(anonymous, 'public', internal.id))?.title,
        `Internal to public ${suffix}`,
      );

      // And back again: access stops, the snapshot stays, and a member still
      // reads it. Withdrawing is never blocked.
      await store.setGuideAudience(who, 'public', internal.id, 'members', 1);
      assert.equal(await store.getRelease(anonymous, 'public', internal.id), null);
      assert.equal(
        (await store.getRelease(who, 'public', internal.id))?.title,
        `Internal to public ${suffix}`,
      );
      assert.equal(
        Number(
          (await owner.query('SELECT count(*) FROM app.release WHERE guide_id=$1', [internal.id]))
            .rows[0].count,
        ),
        1,
      );
      // Both moves are recorded, with the direction.
      const trail = (
        await owner.query(
          "SELECT details FROM app.audit WHERE guide_id=$1 AND action='guide.audience_changed' ORDER BY created_at",
          [internal.id],
        )
      ).rows.map((r) => `${r.details.from}->${r.details.to}`);
      assert.deepEqual(trail, ['members->public', 'public->members']);

      // A members-only category is a blocker, named so the author can act.
      const filed = await store.createDraft(who, 'public', {
        document: { ...doc, title: `Filed privately ${suffix}` },
        categoryId: closed.id,
        audience: 'members',
      });
      await publish(filed.id);
      assert.deepEqual(await store.guidePublicBlockers(who, 'public', filed.id), [
        { kind: 'category', name: `Closed ${suffix}` },
      ]);
      await denied(store.setGuideAudience(who, 'public', filed.id, 'public', 1), 422);
      await assert.rejects(
        store.setGuideAudience(who, 'public', filed.id, 'public', 1),
        new RegExp(`Closed ${suffix}`),
      );

      // So is a members-only catalog item the published version names.
      const secretTool = await item(`Secret driver ${suffix}`, 'keep', 'public', 'members');
      const using = await store.createDraft(who, 'public', {
        document: {
          ...toStructuredDocument({ ...doc, title: `Uses a secret tool ${suffix}` }),
          requirements: [requirement(secretTool)],
        },
        categoryId: open.id,
        audience: 'members',
      });
      await publish(using.id);
      assert.deepEqual(await store.guidePublicBlockers(who, 'public', using.id), [
        { kind: 'item', name: `Secret driver ${suffix}` },
      ]);
      await assert.rejects(
        store.setGuideAudience(who, 'public', using.id, 'public', 1),
        new RegExp(`Secret driver ${suffix}`),
      );

      // A private workspace has no public section to move into at all.
      const privateCategory = await category(
        `Private ${suffix}`,
        null,
        'guide',
        'members',
        'private',
      );
      const inPrivate = await store.createDraft(who, 'private', {
        document: { ...doc, title: `Private only ${suffix}` },
        categoryId: privateCategory.id,
        audience: 'members',
      });
      assert.deepEqual(await store.guidePublicBlockers(who, 'private', inPrivate.id), [
        { kind: 'workspace', name: 'Private' },
      ]);
      await assert.rejects(
        store.setGuideAudience(who, 'private', inPrivate.id, 'public', null),
        /no public section/,
      );

      // Deciding against a version you have not read is refused.
      await denied(store.setGuideAudience(who, 'public', internal.id, 'public', null), 409);

      // And none of this depends on the service being the one to ask.
      await assert.rejects(
        scoped(who, 'public', (c) =>
          c.query("UPDATE app.guide SET audience='public' WHERE id=$1", [filed.id]),
        ),
        new RegExp(`Closed ${suffix}`),
      );
      // Identity is still fixed, which is what immutability was protecting.
      await assert.rejects(
        scoped(who, 'public', (c) =>
          c.query("UPDATE app.guide SET workspace_id='private' WHERE id=$1", [filed.id]),
        ),
        /identity is immutable/,
      );
    },
  );

  await check(
    'the picture chooser lists a workspace to its owner alone, bounded and in scope',
    async () => {
      const suffix = randomUUID().slice(0, 8);
      const made: string[] = [];
      for (let n = 0; n < 3; n += 1) {
        const id = randomUUID();
        await store.createAsset(who, 'public', {
          id,
          contentHash: 'a'.repeat(64),
          mediaType: 'image/webp',
          byteSize: 1000 + n,
          width: 800,
          height: 600,
        });
        made.push(id);
      }

      const owned = await store.listAssets(who, 'public');
      assert(made.every((id) => owned.assets.some((a) => a.id === id)));
      assert.equal(owned.total >= 3, true);
      // Newest first, so the picture just added is the one to hand.
      assert.equal(owned.assets[0]!.id, made[made.length - 1]);

      // Bounded like every other listing, and a parameter cannot undo it.
      assert.equal((await store.listAssets(who, 'public', { limit: 2 })).assets.length, 2);
      assert.equal(
        (await store.listAssets(who, 'public', { limit: 5000 })).assets.length <= 100,
        true,
      );
      const page = await store.listAssets(who, 'public', { limit: 1, offset: 1 });
      assert.equal(page.assets.length, 1);
      assert.notEqual(page.assets[0]!.id, owned.assets[0]!.id);

      // Everyone else is refused. A reader of a workspace can open the guides
      // they may read; that is not the same as leafing through every
      // photograph the workspace holds, including ones no guide uses yet.
      await denied(store.listAssets(anonymous, 'public'), 404);
      await denied(store.listAssets(actor('outsider'), 'public'), 404);
      await denied(store.listAssets(actor('reader'), 'private'), 404);
      await denied(store.listAssets(actor('suspended'), 'private'), 404);

      // And the listing never reaches past its own workspace.
      const elsewhere = await store.listAssets(who, 'private');
      assert.equal(
        elsewhere.assets.some((a) => made.includes(a.id)),
        false,
      );
    },
  );

  await check("a thing's picture is readable exactly as far as the thing is", async () => {
    const suffix = randomUUID().slice(0, 8);
    const openShelf = await category(`Open shelf ${suffix}`);
    const closedShelf = await category(`Closed shelf ${suffix}`, null, 'guide', 'members');
    const childOfClosed = await category(
      `Inside the closed one ${suffix}`,
      closedShelf.id,
      'guide',
      'members',
    );

    const picture = async () => {
      const id = randomUUID();
      await store.createAsset(who, 'public', {
        id,
        contentHash: 'b'.repeat(64),
        mediaType: 'image/webp',
        byteSize: 4096,
        width: 800,
        height: 600,
      });
      return id;
    };
    const openPicture = await picture();
    const closedPicture = await picture();
    const childPicture = await picture();

    await store.setCategoryImage(who, 'public', openShelf.id, openPicture);
    await store.setCategoryImage(who, 'public', closedShelf.id, closedPicture);
    await store.setCategoryImage(who, 'public', childOfClosed.id, childPicture);

    // An owner sees all three, and the id comes back on the thing itself so
    // a gallery needs one request rather than one per row.
    const owned = await store.listCategories(who, 'public', { domain: 'guide' });
    assert.equal(owned.find((c) => c.id === openShelf.id)?.imageAssetId, openPicture);
    assert.equal(owned.find((c) => c.id === closedShelf.id)?.imageAssetId, closedPicture);

    // A visitor may fetch the picture of a thing they can see.
    assert.equal(await store.assetReadable(anonymous, 'public', openPicture), true);

    // And not the picture of one they cannot — nor of anything filed beneath
    // it, which is the case a rule written only against the thing itself
    // would miss.
    assert.equal(await store.assetReadable(anonymous, 'public', closedPicture), false);
    assert.equal(await store.assetReadable(anonymous, 'public', childPicture), false);
    assert.equal(await store.assetReadable(actor('outsider'), 'public', closedPicture), false);
    assert.equal(await store.assetReadable(actor('suspended'), 'public', openPicture), false);

    // Nor from another workspace, whoever is asking.
    assert.equal(await store.assetReadable(who, 'private', openPicture), false);

    // Clearing it takes the access with it.
    await store.setCategoryImage(who, 'public', openShelf.id, null);
    assert.equal(await store.assetReadable(anonymous, 'public', openPicture), false);
    assert.equal(
      (await store.listCategories(who, 'public', { domain: 'guide' })).find(
        (c) => c.id === openShelf.id,
      )?.imageAssetId,
      null,
    );

    // A picture belonging to another workspace cannot be borrowed.
    const foreign = randomUUID();
    await store.createAsset(who, 'private', {
      id: foreign,
      contentHash: 'c'.repeat(64),
      mediaType: 'image/webp',
      byteSize: 2048,
      width: 400,
      height: 300,
    });
    await assert.rejects(store.setCategoryImage(who, 'public', openShelf.id, foreign));
  });

  await check('a guide carries what kind of work it is, beside what it is about', async () => {
    const shelf = await category(`Type shelf ${randomUUID().slice(0, 8)}`);

    // No rows in app.guide_type, so the workspace is on the shipped catalog.
    const settings = await store.guideTypeSettings(who, 'public');
    assert(settings.types.some((t) => t.key === 'replacement'));
    assert.equal(settings.composeTitles, true, 'composing titles is on unless turned off');

    const created = await store.createDraft(who, 'public', {
      document: toStructuredDocument({ ...doc, title: 'Floor (wood) Board Replacement' }),
      categoryId: shelf.id,
      audience: 'members',
      guideType: { key: 'replacement', subject: 'Board' },
    });
    assert.deepEqual(created.guideType, { key: 'replacement', subject: 'Board' });

    // A key the workspace does not offer is refused rather than stored, because
    // no foreign key stands behind this column.
    await assert.rejects(
      store.createDraft(who, 'public', {
        document: toStructuredDocument({ ...doc, title: 'Invented' }),
        categoryId: shelf.id,
        audience: 'members',
        guideType: { key: 'invented', subject: 'x' },
      }),
      /not one this workspace offers/,
    );

    // A type that asks nothing has nowhere to put an answer.
    const teardown = await store.createDraft(who, 'public', {
      document: toStructuredDocument({ ...doc, title: 'Desk lamp Teardown' }),
      categoryId: shelf.id,
      audience: 'members',
      guideType: { key: 'teardown', subject: 'ignored' },
    });
    assert.deepEqual(teardown.guideType, { key: 'teardown', subject: '' });

    // A guide written before types existed still works, and stays untyped.
    const untyped = await store.createDraft(who, 'public', {
      document: toStructuredDocument({ ...doc, title: 'No type at all' }),
      categoryId: shelf.id,
      audience: 'members',
    });
    assert.equal(untyped.guideType, null);

    // The type survives a save, and can be changed or cleared.
    const saved = await store.saveDraft(who, 'public', created.id, {
      expectedVersion: created.version,
      document: created.document,
      categoryId: shelf.id,
      guideType: { key: 'repair', subject: 'Skirting' },
    });
    assert.deepEqual(saved.guideType, { key: 'repair', subject: 'Skirting' });
    const cleared = await store.saveDraft(who, 'public', saved.id, {
      expectedVersion: saved.version,
      document: saved.document,
      categoryId: shelf.id,
    });
    assert.equal(cleared.guideType, null);

    // Once rows exist they are the whole truth: the shipped catalog stops
    // applying, and a type switched off is no longer offered or accepted.
    await scoped(who, 'public', async (c) => {
      await c.query(
        "INSERT INTO app.guide_type(workspace_id,key,label,description,prompt,title_template,sort_order,enabled) VALUES ('public','changeover','Changeover','','Which product?','%thing %subject Changeover',0,true), ('public','replacement','Replacement','','What part?','%thing %subject Replacement',1,false)",
      );
    });
    try {
      const custom = await store.guideTypeSettings(who, 'public');
      assert.deepEqual(
        custom.types.map((t) => t.key),
        ['changeover'],
        'only enabled rows are offered, and the shipped catalog no longer applies',
      );
      await assert.rejects(
        store.createDraft(who, 'public', {
          document: toStructuredDocument({ ...doc, title: 'Switched off' }),
          categoryId: shelf.id,
          audience: 'members',
          guideType: { key: 'replacement', subject: 'Board' },
        }),
        /not one this workspace offers/,
      );
    } finally {
      await scoped(who, 'public', (c) =>
        c.query("DELETE FROM app.guide_type WHERE workspace_id='public'"),
      );
    }
  });
}
