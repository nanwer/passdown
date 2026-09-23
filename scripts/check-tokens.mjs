/**
 * Every design token a stylesheet reads must be one the token build emits.
 *
 * A var(--gp-…) that names nothing resolves to whatever the fallback says, or
 * to nothing at all, and the result is a control that looks almost right —
 * which is exactly the kind of mistake review does not catch. This runs in
 * lint so a typo fails the build instead of shipping. Components read tokens
 * too, through Tailwind classes such as `bg-[var(--gp-…)]`, so their source is
 * checked alongside the stylesheets.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const css = [];
const source = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.next') || entry.startsWith('.')) continue;
    if (entry === 'test-results' || entry === 'playwright-report') continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path);
    else if (entry.endsWith('.css')) css.push(path);
    else if (/\.tsx?$/.test(entry)) source.push(path);
  }
})(root);

const defined = new Set();
for (const path of css)
  for (const [, name] of readFileSync(path, 'utf8').matchAll(/^\s*(--gp-[a-z0-9-]+)\s*:/gm))
    defined.add(name);

const missing = [];
for (const path of [...css, ...source]) {
  const text = readFileSync(path, 'utf8');
  const lines = text.split('\n');
  lines.forEach((line, index) => {
    for (const [, name] of line.matchAll(/var\(\s*(--gp-[a-z0-9-]+)/g))
      if (!defined.has(name)) missing.push(`${relative(root, path)}:${index + 1}  ${name}`);
  });
}

if (missing.length) {
  console.error(`These files read tokens nothing defines:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}
console.log(`Design tokens pass: ${defined.size} defined, every reference resolves.`);
