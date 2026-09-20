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
    categoryId: string,
    kind: 'tool' | 'material' | 'part' = 'tool',
    workspace = 'public',
    visibility: 'public' | 'members' = 'public',
  ) =>
    store.createCatalogItem(who, workspace, {
      name,
      categoryId,
      kind,
      visibility,
      specification: kind === 'tool' ? 'Phillips #00' : 'M2 × 4 mm',
      description: 'Exact test specification',
      manufacturer: '',
      model: '',
      partNumber: '',
      defaultUnit: 'each',
    });
  const editItem = (i: CatalogItem, changes: Partial<CatalogItem>) =>
    store.updateCatalogItem(who, i.workspaceId, i.id, {
      categoryId: i.categoryId,
      kind: i.kind,
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
  const requirement = (i: CatalogItem): GuideRequirement => ({
    id: randomUUID(),
    itemId: i.id,
    itemVersion: i.version,
    kind: i.kind,
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
    tools!: Category,
    materials!: Category,
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
      tools = await category('Hand tools', null, 'tool');
      materials = await category('Fasteners', null, 'material');
      await denied(category('Wrong domain', tools.id));
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
      const phillips = await category('Phillips', tools.id, 'tool');
      driver = await item('Small screwdriver', phillips.id);
      part = await item('Replacement screw', materials.id, 'part');
      const driver0 = await item('Other screwdriver', phillips.id);
      await editItem(driver0, { specification: 'Phillips #0' });
      assert.equal(
        (await store.listCatalogItems(who, 'public', { categoryId: tools.id, search: '#00' }))
          .length,
        1,
      );
      await denied(item('Wrong item', materials.id, 'tool'));
      await denied(item('Wrong part', tools.id, 'part'));
      driver = await editItem(driver, { manufacturer: 'Maker', partNumber: 'DR-00' });
      const otherDriver = await item('Duplicate identifier candidate', phillips.id);
      await denied(editItem(otherDriver, { manufacturer: ' maker ', partNumber: 'dr-00' }));
      await denied(editItem(driver, { defaultUnit: 'ml' }));
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
      const privateToolCategory = await category(
        'Secret tools',
        null,
        'tool',
        'members',
        'private',
      );
      const privateItem = await item(
        'Secret torque tool',
        privateToolCategory.id,
        'tool',
        'private',
        'members',
      );
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
      assert.equal(release.document.schemaVersion, 4);
      if (release.document.schemaVersion === 4)
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
      await denied(editItem(driver, { visibility: 'members' }));
      const driverCategory = (await store.getCategory(who, 'public', driver.categoryId))!;
      await denied(edit(driverCategory, { visibility: 'members' }));
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
      const privateVersion = await item(
        'Initially restricted item',
        tools.id,
        'tool',
        'public',
        'members',
      );
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
      assert.equal(legacy.document.schemaVersion, 4);
      if (legacy.document.schemaVersion === 4)
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
      const req = requirement(part),
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
      await assert.rejects(
        scoped(who, 'public', (c) =>
          c.query('UPDATE app.guide SET category_id=$1 WHERE id=$2', [tools.id, guideId]),
        ),
      );
      await denied(
        store.createCatalogItem(actor('suspended'), 'private', {
          name: 'No',
          categoryId: tools.id,
          kind: 'tool',
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
      const secretTools = await category(`Secret tools ${suffix}`, null, 'tool', 'members');
      const secretTool = await item(
        `Secret driver ${suffix}`,
        secretTools.id,
        'tool',
        'public',
        'members',
      );
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
}
