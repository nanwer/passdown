/**
 * Replaces the local library with a worked example of flat-pack furniture,
 * public and internal.
 *
 * Destructive on purpose: it empties the guides, things, catalog and pictures of
 * the local development database before writing its own, so that what you are
 * looking at is only what this script put there. It refuses to run against
 * anything but `guide_app`; the two test databases belong to the suites.
 *
 * Everything is written through the running application's own API rather than
 * straight into tables, so every guide here has been through the same
 * validation, the same publication rules and the same media pipeline as one
 * written by hand. If the seed can produce it, so can a person — and if a rule
 * changes, this script fails rather than quietly writing something the product
 * would now reject.
 *
 *   pnpm dev            # in one terminal
 *   pnpm seed:showcase  # in another
 */
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { readConfig } from './local-config.mjs';
import { requireLocal } from './migrate-local.mjs';
import { composeGuideTitle, defaultGuideTypes } from '../packages/guide-content/src/guide-types';
import type { Category, CatalogItem, DraftGuide } from '../packages/contracts/src/index';
import {
  publicCategories,
  productionCategories,
  publicTools,
  publicParts,
  productionTools,
  productionMaterials,
  publicGuides,
  productionGuides,
  type ShowcaseCategory,
  type ShowcaseGuide,
  type ShowcaseItem,
  type ShowcasePhoto,
  type ShowcaseStep,
} from './showcase-content';

const config = readConfig();
const origin = config.BETTER_AUTH_URL || 'http://127.0.0.1:3100';
/** Downloaded photographs, kept out of the repository and out of the way. */
const photoCache = join(tmpdir(), 'passdown-showcase-photos');
const PUBLIC_WORKSPACE = 'repair-collective';
const PRODUCTION_WORKSPACE = 'workshop';

const owner = requireLocal(config.GUIDE_OWNER_DATABASE_URL!);
if (owner.pathname !== '/guide_app')
  throw new Error(
    `This rewrites a whole library, so it only runs against guide_app. Got ${owner.pathname}.`,
  );

/** The session cookie, once we have signed in as the local owner. */
let cookie = '';

const wait = (seconds: number) => new Promise((done) => setTimeout(done, seconds * 1000));

/**
 * Writing a library is hundreds of mutations and the API allows 120 a minute.
 *
 * Which is correct — a person writing guides never approaches it, and something
 * that does is worth slowing down. So the seed waits its turn rather than the
 * limit being raised for it.
 */
async function withPatience<T>(what: string, attempt: () => Promise<Response>): Promise<Response> {
  for (let tries = 0; ; tries++) {
    const response = await attempt();
    if (response.status !== 429) return response;
    if (tries >= 6) return response;
    process.stdout.write(`  …rate limit reached, waiting 30s before ${what}\n`);
    await wait(30);
  }
}

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await withPatience(`${method} ${path}`, () =>
    fetch(`${origin}${path}`, {
      method,
      headers: {
        origin,
        cookie,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }),
  );
  const text = await response.text();
  if (!response.ok)
    throw new Error(`${method} ${path} → ${response.status}: ${text.slice(0, 400)}`);
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

async function signIn() {
  const response = await fetch(`${origin}/api/auth/sign-in/email`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify({
      email: config.GUIDE_LOCAL_OWNER_EMAIL,
      password: config.GUIDE_LOCAL_OWNER_PASSWORD,
    }),
  });
  if (!response.ok)
    throw new Error(
      `Could not sign in as the local owner (${response.status}). Is \`pnpm dev\` running on ${origin}?`,
    );
  cookie = response.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
}

/**
 * Empties the library, leaving the installation itself alone.
 *
 * Workspaces, memberships and accounts stay: you keep the login you already
 * have. Everything a workspace contains goes, including the stored pictures,
 * because an asset row without its bytes is worse than neither.
 */
async function empty(client: pg.Client) {
  const counted = await client.query<{ guides: string; categories: string; items: string }>(
    `SELECT (SELECT count(*) FROM app.guide) AS guides,
            (SELECT count(*) FROM app.category) AS categories,
            (SELECT count(*) FROM app.catalog_item) AS items`,
  );
  const before = counted.rows[0];
  // Discovered rather than listed, so a table added later is not silently left
  // holding rows that point at things this script has just deleted.
  const tables = (
    await client.query<{ name: string }>(
      `SELECT format('%I.%I', schemaname, tablename) AS name FROM pg_tables
       WHERE schemaname = 'app' AND tablename NOT IN ('workspace', 'membership', 'guide_type')`,
    )
  ).rows.map((row) => row.name);
  await client.query(`TRUNCATE ${tables.join(',')} CASCADE`);
  await rm(resolve(process.env.GUIDE_MEDIA_ROOT ?? join(process.cwd(), '.media')), {
    recursive: true,
    force: true,
  });
  return before;
}

/** Every category, depth first, so a child is always created after its parent. */
async function createCategories(
  workspace: string,
  tree: ShowcaseCategory[],
  visibility: 'public' | 'members',
) {
  const byName = new Map<string, Category>();
  async function branch(nodes: ShowcaseCategory[], parentId: string | null) {
    let sortOrder = 0;
    for (const node of nodes) {
      const { category } = await call<{ category: Category }>(
        `/api/studio/${workspace}/categories`,
        'POST',
        {
          domain: 'guide',
          parentId,
          name: node.name,
          description: node.description,
          visibility,
          sortOrder: sortOrder++,
        },
      );
      byName.set(node.name, category);
      if (node.children) await branch(node.children, category.id);
    }
  }
  await branch(tree, null);
  return byName;
}

async function createCatalog(
  workspace: string,
  items: ShowcaseItem[],
  visibility: 'public' | 'members',
) {
  const byName = new Map<string, CatalogItem>();
  for (const item of items) {
    const { item: created } = await call<{ item: CatalogItem }>(
      `/api/studio/${workspace}/catalog`,
      'POST',
      { ...item, visibility },
    );
    byName.set(item.name, created);
  }
  return byName;
}

/**
 * A picture for each top-level thing.
 *
 * Drawn here rather than photographed: a seed that shipped photographs would be
 * shipping someone's photographs. These are plainly diagrams, which is honest
 * about what they are, and they exercise the whole media path — upload,
 * re-encode, rendition, and the authorization that decides who may see them.
 */
async function drawPicture(label: string, seed: number) {
  const sharp = (await import('sharp')).default;
  const hue = (seed * 47) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="450">
    <rect width="800" height="450" fill="hsl(${hue} 42% 94%)"/>
    <g stroke="hsl(${hue} 30% 70%)" stroke-width="1">
      ${Array.from({ length: 16 }, (_, n) => `<line x1="${n * 50}" y1="0" x2="${n * 50}" y2="450"/>`).join('')}
      ${Array.from({ length: 9 }, (_, n) => `<line x1="0" y1="${n * 50}" x2="800" y2="${n * 50}"/>`).join('')}
    </g>
    <rect x="150" y="120" width="500" height="210" rx="14" fill="none"
      stroke="hsl(${hue} 65% 34%)" stroke-width="10"/>
    <line x1="150" y1="225" x2="650" y2="225" stroke="hsl(${hue} 65% 34%)" stroke-width="6"/>
    <text x="400" y="392" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
      font-size="34" fill="hsl(${hue} 60% 22%)">${label.replace(/[<>&]/g, '')}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

/**
 * A photograph from Wikimedia Commons.
 *
 * Fetched when the seed runs rather than committed, so this repository carries
 * no image files — and cached on disk afterwards, so running the seed twenty
 * times during a week's work asks Wikimedia for each picture once.
 *
 * Returns null when it cannot be had: no network, or a rate limit that outlasts
 * the retries. A seed that only works online is a seed that fails on a train,
 * and a drawing is a reasonable thing to fall back to as long as it says so.
 */
async function fetchPhoto(photo: ShowcasePhoto): Promise<Buffer | null> {
  const cached = join(photoCache, createHash('sha256').update(photo.url).digest('hex') + '.bin');
  try {
    return await readFile(cached);
  } catch {
    /* Not fetched yet. */
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const response = await fetch(photo.url, {
        headers: { 'user-agent': 'passdown-seed/0.1 (local development)' },
        signal: AbortSignal.timeout(25000),
      });
      if (response.status === 429) {
        process.stdout.write('  …Wikimedia is asking for a slower pace, waiting 20s\n');
        await wait(20);
        continue;
      }
      if (!response.ok) {
        process.stdout.write(
          `  …photograph unavailable (${response.status}), drawing one instead\n`,
        );
        return null;
      }
      const bytes = Buffer.from(await response.arrayBuffer());
      await mkdir(photoCache, { recursive: true });
      await writeFile(cached, bytes);
      return bytes;
    } catch (e) {
      // Said out loud. A silent fallback is why the first run of this quietly
      // drew diagrams for eight guides meant to carry photographs.
      process.stdout.write(
        `  …photograph unavailable (${e instanceof Error ? e.message : e}), drawing one instead\n`,
      );
      return null;
    }
  }
  process.stdout.write('  …photograph still rate limited, drawing one instead\n');
  return null;
}

let pictureSeed = 0;

/** Uploads a picture and returns its asset id. */
async function uploadPicture(workspace: string, label: string, photo?: ShowcasePhoto) {
  const bytes = (photo && (await fetchPhoto(photo))) ?? (await drawPicture(label, ++pictureSeed));
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'cover.png');
  const response = await withPatience('uploading a picture', () =>
    fetch(`${origin}/api/studio/${workspace}/assets`, {
      method: 'POST',
      headers: { origin, cookie },
      body: form,
    }),
  );
  if (!response.ok) throw new Error(`upload → ${response.status}: ${await response.text()}`);
  return ((await response.json()) as { asset: { id: string } }).asset.id;
}

async function setPicture(workspace: string, category: Category, seed: number) {
  const bytes = await drawPicture(category.name, seed);
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)], { type: 'image/png' }), 'thing.png');
  const response = await withPatience('uploading a picture', () =>
    fetch(`${origin}/api/studio/${workspace}/assets`, {
      method: 'POST',
      headers: { origin, cookie },
      body: form,
    }),
  );
  if (!response.ok) throw new Error(`upload → ${response.status}: ${await response.text()}`);
  const { asset } = (await response.json()) as { asset: { id: string } };
  await call(`/api/studio/${workspace}/categories/${category.id}/image`, 'PUT', {
    assetId: asset.id,
  });
}

const run = (text: string) => ({ type: 'text' as const, text, marks: [] });
const paragraph = (text: string) => ({ type: 'paragraph' as const, children: [run(text)] });

function body(step: ShowcaseStep) {
  const blocks: unknown[] = [paragraph(step.text)];
  if (step.more) blocks.push(paragraph(step.more));
  if (step.bullets)
    blocks.push({
      type: 'list',
      ordered: false,
      start: 1,
      items: step.bullets.map((item) => [run(item)]),
    });
  if (step.table)
    blocks.push({
      type: 'table',
      headers: step.table.headers.map((cell) => [run(cell)]),
      rows: step.table.rows.map((row) => row.map((cell) => [run(cell)])),
      align: step.table.headers.map(() => null),
    });
  if (step.panel)
    blocks.push({ type: 'panel', tone: step.panel.tone, children: [paragraph(step.panel.text)] });
  return blocks;
}

/**
 * Builds the document the editor would have produced.
 *
 * Requirements carry the catalog item's identity and version, because a
 * published release freezes what it depended on rather than following the
 * catalog afterwards. Steps then refer to those requirements by id, which is
 * what lets a step say it uses two of something the guide listed once.
 */
function documentFor(
  guide: ShowcaseGuide,
  catalog: Map<string, CatalogItem>,
  title: string,
  illustrated?: { assetId: string; step?: string; alt: string; caption: string },
) {
  const requirementIds = new Map<string, string>();
  const requirements = (guide.needs ?? []).map((need) => {
    const item = catalog.get(need.item);
    if (!item) throw new Error(`${title}: no catalog item called "${need.item}"`);
    const id = randomUUID();
    requirementIds.set(need.item, id);
    return {
      id,
      itemId: item.id,
      itemVersion: item.version,
      role: need.role,
      name: item.name,
      specification: item.specification,
      description: item.description,
      manufacturer: item.manufacturer,
      model: item.model,
      partNumber: item.partNumber,
      quantity: need.quantity,
      unit: need.unit,
      optional: need.optional ?? false,
      notes: need.notes ?? '',
    };
  });

  const stepIds = new Map<string, string>();
  for (const step of guide.steps) stepIds.set(step.title, randomUUID());

  const onStep = illustrated?.step ?? guide.steps[0]?.title;
  const steps = guide.steps.map((step) => ({
    id: stepIds.get(step.title)!,
    title: step.title,
    body: body(step),
    media:
      illustrated && step.title === onStep
        ? [
            {
              assetId: illustrated.assetId,
              alt: illustrated.alt,
              caption: illustrated.caption,
              annotations: [],
            },
          ]
        : [],
    callouts: [],
    requirements: (step.uses ?? []).map((use) => {
      const requirementId = requirementIds.get(use.item);
      if (!requirementId)
        throw new Error(`${title}: step uses "${use.item}", which it never lists`);
      const need = guide.needs!.find((candidate) => candidate.item === use.item)!;
      return {
        requirementId,
        quantity: use.quantity ?? null,
        unit: need.unit,
        mode: use.mode ?? (need.role === 'keep' ? ('reuse' as const) : ('consume' as const)),
        optional: need.optional ?? false,
        notes: '',
      };
    }),
    preconditions: (step.before ?? []).map((condition) => ({
      id: randomUUID(),
      text: condition.text,
      tone: condition.tone,
    })),
    earlierStepIds: (step.after ?? []).map((earlier) => {
      const id = stepIds.get(earlier);
      if (!id) throw new Error(`${title}: step depends on "${earlier}", which is not a step here`);
      return id;
    }),
  }));

  return {
    schemaVersion: 5 as const,
    title,
    summary: guide.summary,
    locale: 'en',
    difficulty: guide.difficulty,
    durationMinutes: guide.minutes,
    tools: [],
    requirements,
    unresolvedTools: [],
    steps,
  };
}

async function writeGuides(
  workspace: string,
  guides: ShowcaseGuide[],
  categories: Map<string, Category>,
  catalog: Map<string, CatalogItem>,
  audience: 'public' | 'members',
) {
  const byTitle = new Map<string, string>();
  const families: { child: string; parent: string }[] = [];

  for (const guide of guides) {
    const type = defaultGuideTypes.find((candidate) => candidate.key === guide.type);
    if (!type) throw new Error(`No guide type called "${guide.type}"`);
    const category = categories.get(guide.thing);
    if (!category) throw new Error(`No thing called "${guide.thing}"`);
    const title = composeGuideTitle(type, { thing: guide.thing, subject: guide.subject });

    // A cover of its own, so a listing shows the guide rather than the thing.
    // Where there is a photograph it is both the cover and the picture on the
    // step it illustrates, which is how an author would use it.
    const cover = await uploadPicture(workspace, title, guide.photo);
    const illustrated = guide.photo
      ? {
          assetId: cover,
          step: guide.photo.step,
          alt: guide.photo.alt,
          caption: guide.photo.credit,
        }
      : undefined;
    const document = documentFor(guide, catalog, title, illustrated);
    const created = await call<{ guide: DraftGuide }>(`/api/studio/${workspace}/guides`, 'POST', {
      document,
      categoryId: category.id,
      audience,
      guideType: { key: guide.type, subject: guide.subject },
      coverAssetId: cover,
    });
    const id = created.guide.id;
    byTitle.set(title, id);
    if (guide.under) families.push({ child: title, parent: guide.under });

    await call(`/api/studio/${workspace}/guides/${id}/publish`, 'POST', {
      expectedVersion: created.guide.version,
      expectedRelease: null,
      // The product refuses an open licence on a members-only guide, which is
      // the right rule: you cannot grant reuse of something you have not shared.
      license: audience === 'public' ? 'CC-BY-4.0' : 'all-rights-reserved',
    });
    process.stdout.write(`  ${title}\n`);
  }

  // Families last: a guide cannot be placed beneath one that does not exist yet.
  for (const { child, parent } of families) {
    const parentId = byTitle.get(parent);
    if (!parentId) throw new Error(`"${child}" sits under "${parent}", which was never written`);
    await call(`/api/studio/${workspace}/guides/${byTitle.get(child)}/family`, 'PUT', {
      parentGuideId: parentId,
      sortOrder: 0,
    });
  }
  return byTitle.size;
}

const client = new pg.Client({ connectionString: config.GUIDE_OWNER_DATABASE_URL });
await client.connect();
try {
  await signIn();
  const before = await empty(client);
  console.log(
    `Removed ${before.guides} guides, ${before.categories} things and ${before.items} catalog items.`,
  );

  console.log('\nThe public library — what a customer reads');
  const homeThings = await createCategories(PUBLIC_WORKSPACE, publicCategories, 'public');
  const homeCatalog = await createCatalog(
    PUBLIC_WORKSPACE,
    [...publicTools, ...publicParts],
    'public',
  );
  let seed = 1;
  for (const node of publicCategories)
    await setPicture(PUBLIC_WORKSPACE, homeThings.get(node.name)!, seed++);
  const home = await writeGuides(PUBLIC_WORKSPACE, publicGuides, homeThings, homeCatalog, 'public');

  console.log('\nThe members-only library — what the factory reads');
  const factoryThings = await createCategories(
    PRODUCTION_WORKSPACE,
    productionCategories,
    'members',
  );
  const factoryCatalog = await createCatalog(
    PRODUCTION_WORKSPACE,
    [...productionTools, ...productionMaterials],
    'members',
  );
  for (const node of productionCategories)
    await setPicture(PRODUCTION_WORKSPACE, factoryThings.get(node.name)!, seed++);
  const factory = await writeGuides(
    PRODUCTION_WORKSPACE,
    productionGuides,
    factoryThings,
    factoryCatalog,
    'members',
  );

  console.log(
    `\n${home} public guides across ${homeThings.size} things and ${homeCatalog.size} catalog items.` +
      `\n${factory} members-only guides across ${factoryThings.size} things and ${factoryCatalog.size} catalog items.`,
  );
} finally {
  await client.end();
}
