#!/usr/bin/env node
// Print the version this checkout releases, refusing unless the source names one
// alpha version everywhere and, with --tag, the tag is exactly v<version>.
//   node scripts/check-release-version.mjs [--tag v0.1.0-alpha.1] [--root DIR]
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const alpha = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)-alpha\.(0|[1-9]\d*)$/;

export function releaseVersionProblems(root, tag) {
  const problems = [];
  const read = (path) => readFileSync(join(root, path), 'utf8');
  const version = read('packages/contracts/src/build-info.ts').match(
    /export const passdownVersion = '([^']+)'/,
  )?.[1];
  if (!version) return { problems: ['build-info.ts names no passdownVersion'] };
  if (!alpha.test(version)) problems.push(`${version} is not an alpha version (X.Y.Z-alpha.N)`);
  if (tag !== undefined && tag !== `v${version}`)
    problems.push(`tag ${tag} does not match the source version ${version}; expected v${version}`);
  const packages = ['package.json'];
  for (const group of ['apps', 'packages'])
    for (const name of readdirSync(join(root, group)))
      packages.push(`${group}/${name}/package.json`);
  for (const path of packages) {
    const found = JSON.parse(read(path)).version;
    if (found !== version) problems.push(`${path} names ${found}, not ${version}`);
  }
  for (const path of ['deploy/compose.yaml'])
    for (const [, name, found] of read(path).matchAll(
      /ghcr\.io\/nanwer\/(passdown(?:-caddy)?):([^\s@}'"]+)/g,
    ))
      if (found !== version) problems.push(`${path} tags ${name} ${found}, not ${version}`);
  return { version, problems };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  let tag;
  let root = join(dirname(fileURLToPath(import.meta.url)), '..');
  for (let i = 0; i < args.length; i += 2) {
    if (args[i] === '--tag' && args[i + 1] !== undefined) tag = args[i + 1];
    else if (args[i] === '--root' && args[i + 1] !== undefined) root = resolve(args[i + 1]);
    else {
      console.error('Usage: check-release-version.mjs [--tag vX.Y.Z-alpha.N] [--root DIR]');
      process.exit(2);
    }
  }
  const { version, problems } = releaseVersionProblems(root, tag);
  if (problems.length) {
    for (const problem of problems) console.error(problem);
    process.exit(1);
  }
  console.log(version);
}
