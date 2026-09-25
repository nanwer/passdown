import { expect, test } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applicationRoutes } from './warm-routes';

test('every page and route handler of the application is warmed', () => {
  const routes = applicationRoutes();
  expect(routes).toEqual(
    expect.arrayContaining([
      { path: '/', kind: 'page' },
      // The route whose first compile outlasted an assertion in hosted runs.
      { path: '/categories/warm-up', kind: 'page' },
      { path: '/studio/warm-up/warm-up', kind: 'page' },
      { path: '/api/studio/warm-up/categories', kind: 'handler' },
      { path: '/api/auth/warm-up', kind: 'handler' },
    ]),
  );
  expect(new Set(routes.map((route) => route.path)).size).toBe(routes.length);
});

test('route groups, private folders, slots and optional catch-alls add no segment', () => {
  const root = mkdtempSync(join(tmpdir(), 'warm-routes-'));
  const page = (...segments: string[]) => {
    mkdirSync(join(root, ...segments), { recursive: true });
    writeFileSync(join(root, ...segments, 'page.tsx'), '');
  };
  page('(marketing)', 'about');
  page('docs', '[[...slug]]');
  page('_components');
  page('@modal', 'photo');
  mkdirSync(join(root, 'api', '[id]'), { recursive: true });
  writeFileSync(join(root, 'api', '[id]', 'route.ts'), '');
  expect(applicationRoutes(root).sort((a, b) => a.path.localeCompare(b.path))).toEqual([
    { path: '/about', kind: 'page' },
    { path: '/api/warm-up', kind: 'handler' },
    { path: '/docs', kind: 'page' },
  ]);
});
