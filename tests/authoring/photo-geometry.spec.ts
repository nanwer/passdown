import { test, expect, type Locator, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { readConfig } from '../../scripts/local-config.mjs';
import { toStructuredDocument } from '../../packages/guide-content/src/index';
import type { DraftGuide } from '@guide/contracts';

const credentials = readConfig();
const workspace = 'repair-collective';
const headers = { Origin: 'http://127.0.0.1:3101' };
const photos = [
  { name: 'portrait', width: 3000, height: 4000 },
  { name: 'square', width: 1000, height: 1000 },
  { name: 'tall', width: 320, height: 960 },
  { name: 'landscape', width: 1600, height: 900 },
];

async function fittedBounds(frame: Locator, ratio: number) {
  await frame.scrollIntoViewIfNeeded();
  // Decode follows the image's actual loading lifecycle, bounded by the test
  // timeout, rather than giving network delivery a geometry assertion's 5s.
  await frame.locator('img').evaluate(async (image: HTMLImageElement) => {
    try {
      await image.decode();
    } catch {
      throw new Error('Photograph failed to load or decode');
    }
    if (!image.naturalWidth || !image.naturalHeight)
      throw new Error('Photograph decoded without usable dimensions');
  });
  await expect
    .poll(
      async () => {
        const box = await frame.boundingBox();
        return box ? Math.abs(box.width - box.height * ratio) : Infinity;
      },
      { message: 'Annotation coordinates must use the photograph’s actual aspect ratio' },
    )
    .toBeLessThanOrEqual(1);
  const bounds = await frame.evaluate((node) => {
    const image = node.querySelector('img')!;
    const stage = node.parentElement!.getBoundingClientRect();
    const box = node.getBoundingClientRect();
    const picture = image.getBoundingClientRect();
    return {
      left: box.left - stage.left,
      top: box.top - stage.top,
      right: stage.right - box.right,
      bottom: stage.bottom - box.bottom,
      imageWidthDifference: Math.abs(picture.width - box.width),
      imageHeightDifference: Math.abs(picture.height - box.height),
      naturalRatio: image.naturalWidth / image.naturalHeight,
    };
  });
  expect(bounds.naturalRatio).toBeCloseTo(ratio, 2);
  for (const edge of ['left', 'top', 'right', 'bottom'] as const)
    expect(
      bounds[edge],
      `The ${edge} of the photograph must stay inside its reserved stage`,
    ).toBeGreaterThanOrEqual(-1);
  expect(bounds.imageWidthDifference).toBeLessThanOrEqual(1);
  expect(bounds.imageHeightDifference).toBeLessThanOrEqual(1);
}

async function createPhotoGuide(page: Page, photo: (typeof photos)[number]) {
  const login = await page.request.post('/api/auth/sign-in/email', {
    headers,
    data: {
      email: credentials.GUIDE_LOCAL_OWNER_EMAIL,
      password: credentials.GUIDE_LOCAL_OWNER_PASSWORD,
    },
  });
  expect(login.status()).toBe(200);
  const categoryResponse = await page.request.post(`/api/studio/${workspace}/categories`, {
    headers,
    data: {
      domain: 'guide',
      parentId: null,
      name: `Photo geometry ${photo.name} ${randomUUID().slice(0, 8)}`,
      description: 'Photograph fitting regression.',
      visibility: 'public',
      sortOrder: 0,
    },
  });
  expect(categoryResponse.status()).toBe(201);
  const categoryId = (await categoryResponse.json()).category.id as string;
  const bytes = await sharp({
    create: { width: photo.width, height: photo.height, channels: 3, background: '#35506b' },
  })
    .jpeg()
    .toBuffer();
  const uploaded = await page.request.post(`/api/studio/${workspace}/assets`, {
    headers,
    multipart: { file: { name: `${photo.name}.jpg`, mimeType: 'image/jpeg', buffer: bytes } },
  });
  expect(uploaded.status()).toBe(201);
  const assetId = (await uploaded.json()).asset.id as string;
  const document = toStructuredDocument(
    {
      schemaVersion: 3,
      title: `${photo.name} geometry`,
      summary: 'Keep the whole photograph available for annotation.',
      locale: 'en',
      difficulty: 'easy',
      durationMinutes: 5,
      tools: [],
      steps: [
        {
          id: randomUUID(),
          title: 'Mark the bottom edge',
          body: [
            {
              type: 'paragraph',
              children: [
                {
                  type: 'text',
                  text: 'Select a detail near the bottom of the photograph.',
                  marks: [],
                },
              ],
            },
          ],
          media: [{ assetId, alt: `${photo.name} photograph`, caption: '', annotations: [] }],
          callouts: [],
        },
      ],
    },
    randomUUID,
  );
  const created = await page.request.post(`/api/studio/${workspace}/guides`, {
    headers,
    data: { document, categoryId, audience: 'public' },
  });
  expect(created.status()).toBe(201);
  const guide = (await created.json()).guide as DraftGuide;
  return { guide, assetId };
}

for (const photo of photos) {
  test(`${photo.name} photo stays proportional and its bottom-edge mark is clickable`, async ({
    page,
  }) => {
    const { guide } = await createPhotoGuide(page, photo);
    await page.goto(`/studio/${workspace}/${guide.id}`);
    const frame = page.locator('.studio-annotate-frame');
    await fittedBounds(frame, photo.width / photo.height);
    await frame.scrollIntoViewIfNeeded();
    const box = (await frame.boundingBox())!;
    // Hit the photograph near its bottom, not the overflow clip or controls.
    await page.mouse.click(
      Math.round(box.x + box.width * 0.5),
      Math.round(box.y + box.height * 0.92),
    );
    const mark = frame.getByRole('button', { name: 'Mark 1. Arrow keys move it.', exact: true });
    await expect(mark).toBeVisible();
    await mark.click();
    await expect(frame.locator('.studio-annotate-handle')).toHaveCount(1);
    const position = await mark.evaluate((node) => ({
      x: parseFloat(node.style.left) / 100,
      y: parseFloat(node.style.top) / 100,
    }));
    // Pointer coordinates are quantized to browser pixels, unlike keyboard
    // nudges. Allow one pixel plus the normalized coordinate’s 4-digit
    // rounding; a letterboxing offset would still fail this bound.
    expect(Math.abs(position.x - 0.5)).toBeLessThanOrEqual(1 / box.width + 0.0001);
    expect(Math.abs(position.y - 0.92)).toBeLessThanOrEqual(1 / box.height + 0.0001);
    await mark.focus();
    await page.keyboard.press('ArrowUp');
    await expect
      .poll(() => mark.evaluate((node) => parseFloat(node.style.top) / 100))
      .toBeCloseTo(position.y - 0.02, 4);
    await page.getByRole('textbox', { name: 'Mark 1 label' }).fill('Bottom edge detail');
    await page.setViewportSize({ width: 390, height: 844 });
    await fittedBounds(frame, photo.width / photo.height);
    const mobileMark = frame.getByRole('button', {
      name: 'Bottom edge detail. Arrow keys move it.',
      exact: true,
    });
    await mobileMark.click();
    await expect(frame.locator('.studio-annotate-handle')).toHaveCount(1);
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
    const savedResponse = await page.request.get(`/api/studio/${workspace}/guides/${guide.id}`);
    expect(savedResponse.status()).toBe(200);
    const saved = (await savedResponse.json()).guide as DraftGuide;
    expect(saved.document.steps[0]!.media[0]!.annotations).toEqual([
      {
        type: 'pin',
        x: Number(position.x.toFixed(4)),
        y: Number((position.y - 0.02).toFixed(4)),
        label: 'Bottom edge detail',
      },
    ]);
  });
}

test('photo geometry waits for the held image response before checking bounds', async ({
  page,
}) => {
  const photo = photos[0]!;
  const { guide, assetId } = await createPhotoGuide(page, photo);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requested!: () => void;
  const requestStarted = new Promise<void>((resolve) => {
    requested = resolve;
  });
  await page.route(`**/api/media/${guide.workspaceId}/${assetId}*`, async (route) => {
    requested();
    await held;
    await route.continue();
  });
  await page.goto(`/studio/${workspace}/${guide.id}`, { waitUntil: 'domcontentloaded' });
  const frame = page.locator('.studio-annotate-frame');
  await frame.scrollIntoViewIfNeeded();
  await requestStarted;
  let settled = false;
  const fitting = fittedBounds(frame, photo.width / photo.height).finally(() => {
    settled = true;
  });
  try {
    expect(
      await frame.locator('img').evaluate((image: HTMLImageElement) => ({
        complete: image.complete,
        width: image.naturalWidth,
      })),
    ).toEqual({ complete: false, width: 0 });
    expect(settled, 'Geometry must remain pending while the photograph response is held').toBe(
      false,
    );
  } finally {
    release();
  }
  await fitting;
});

for (const failure of ['missing', 'invalid'] as const) {
  test(`photo geometry reports ${failure} image failure explicitly`, async ({ page }) => {
    const photo = photos[0]!;
    const { guide, assetId } = await createPhotoGuide(page, photo);
    await page.route(`**/api/media/${guide.workspaceId}/${assetId}*`, (route) =>
      route.fulfill({
        status: failure === 'missing' ? 404 : 200,
        contentType: 'image/jpeg',
        body: 'This is not a photograph.',
      }),
    );
    await page.goto(`/studio/${workspace}/${guide.id}`);
    await expect(
      fittedBounds(page.locator('.studio-annotate-frame'), photo.width / photo.height),
    ).rejects.toThrow('Photograph failed to load or decode');
  });
}
