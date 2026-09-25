import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';

const app = join(__dirname, '..', 'app');
function routeFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return routeFiles(path);
    return entry.name === 'route.ts' ? [path] : [];
  });
}

describe('API error logs name the route pattern', () => {
  // Logs carry the pattern, never the concrete address: paths can hold tokens.
  it('passes each handler its own route pattern and method', () => {
    const files = routeFiles(join(app, 'api'));
    expect(files.length).toBeGreaterThan(20);
    let calls = 0;
    for (const file of files) {
      const pattern = '/' + relative(app, file).split(sep).slice(0, -1).join('/');
      const source = readFileSync(file, 'utf8');
      let method: string | null = null;
      // Handlers and calls in source order; formatting may wrap a call's arguments.
      const tokens = source.matchAll(
        /export (?:async )?function (GET|POST|PUT|PATCH|DELETE)\b|apiResponse\(\s*([^]*?),\s*async/g,
      );
      for (const token of tokens) {
        if (token[1]) {
          method = token[1];
          continue;
        }
        calls++;
        expect(method, `${file}: apiResponse outside a handler`).not.toBeNull();
        expect(token[2]!.replace(/\s+/g, ' ').trim(), file).toBe(
          `{ route: '${pattern}', method: '${method}' }`,
        );
      }
    }
    expect(calls).toBeGreaterThan(30);
  });
});
