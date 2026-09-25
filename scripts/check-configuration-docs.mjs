/**
 * Every Passdown setting the code or the deployment files read must be in the
 * configuration reference, and the reference must not describe settings that
 * nothing reads any more.
 *
 * Settings are the GUIDE_, PASSDOWN_ and BETTER_AUTH_ names. The reference is
 * how an operator learns what a name means; an undocumented one is a setting
 * nobody can use correctly, and a stale one sends people after something that
 * no longer works. This runs in lint.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const reference = 'docs/self-hosting/configuration.md';
const name = /\b(?:GUIDE|PASSDOWN|BETTER_AUTH)_[A-Z0-9_]*[A-Z0-9]\b/g;

function files(dir, keep) {
  const found = [];
  (function walk(path) {
    for (const entry of readdirSync(path)) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      const child = join(path, entry);
      if (statSync(child).isDirectory()) walk(child);
      else if (keep(entry)) found.push(child);
    }
  })(join(root, dir));
  return found;
}
const code = (entry) => /\.(?:ts|tsx|mjs)$/.test(entry) && !/\.(?:test|spec)\.tsx?$/.test(entry);
const sources = [
  ...files('apps/web/app', code),
  ...files('apps/web/lib', code),
  ...files('apps/web/components', code),
  join(root, 'apps/web/next.config.ts'),
  join(root, 'apps/web/instrumentation.ts'),
  ...files('apps/operator/src', code),
  ...files('packages/database/src', code),
  join(root, 'packages/contracts/src/build-info.ts'),
  join(root, 'scripts/local-config.mjs'),
  join(root, 'Dockerfile'),
  ...files('deploy', (entry) => !entry.endsWith('.test.ts') && !entry.startsWith('LICENSE')),
];

const read = new Map();
for (const path of sources)
  for (const [match] of readFileSync(path, 'utf8').matchAll(name))
    if (!read.has(match)) read.set(match, relative(root, path));

const documented = new Set(readFileSync(join(root, reference), 'utf8').match(name) ?? []);
const undocumented = [...read].filter(([setting]) => !documented.has(setting));
const stale = [...documented].filter((setting) => !read.has(setting));

for (const [setting, path] of undocumented)
  console.error(`${setting} is read in ${path} but not described in ${reference}.`);
for (const setting of stale)
  console.error(`${setting} is described in ${reference} but nothing reads it.`);
if (undocumented.length || stale.length) process.exit(1);
console.log(`Configuration reference covers all ${read.size} settings.`);
