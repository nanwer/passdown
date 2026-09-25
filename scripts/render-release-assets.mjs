#!/usr/bin/env node
// Render the files a Passdown release attaches for installation: the compose
// files with every image pinned to its published digest, the three operator
// scripts unchanged, and SHA256SUMS. Also checks a rendered directory (T27).
//
//   node scripts/render-release-assets.mjs --version V --output DIR \
//     --digest passdown=sha256:… --digest passdown-caddy=sha256:… --digest passdown-nginx=sha256:…
//   node scripts/render-release-assets.mjs --check DIR --version V
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const registry = 'ghcr.io/nanwer';
export const releaseImages = ['passdown', 'passdown-caddy', 'passdown-nginx'];
const composeFiles = ['compose.yaml', 'compose.nginx.yaml'];
const scripts = ['init.sh', 'upgrade.sh', 'backup.sh'];
export const releaseFiles = [...composeFiles, ...scripts].sort();

const digestPattern = /^sha256:[0-9a-f]{64}$/;
const versionPattern = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-alpha\.(0|[1-9]\d*))?$/;
// `image: value`, `image: 'value'` or `image: ${VARIABLE:-value}`.
const imageLine = /^(\s*image:\s*)(['"]?)(.*?)\2\s*$/;
const buildKey = /(^|[\s{,])build\s*:/m;
const pinnedReference =
  /^([a-z0-9]+(?:[._/-][a-z0-9]+)*):([A-Za-z0-9_][A-Za-z0-9._-]{0,127})@(sha256:[0-9a-f]{64})$/;

function splitImage(value) {
  const variable = value.match(/^\$\{([A-Z0-9_]+)(?::-(.*))?\}$/);
  if (!variable) return { prefix: '', reference: value, suffix: '' };
  if (variable[2] === undefined)
    return { prefix: '', reference: '', suffix: '', unresolved: value };
  return { prefix: `\${${variable[1]}:-`, reference: variable[2], suffix: '}' };
}

function passdownImage(reference) {
  const match = reference.match(/^ghcr\.io\/nanwer\/([a-z-]+)(?::([^@]+))?(?:@(.+))?$/);
  return match && { name: match[1], tag: match[2], digest: match[3] };
}

function requireVersion(version) {
  if (!versionPattern.test(version ?? '')) throw new Error(`Invalid release version: ${version}`);
}

/** Pin every Passdown image in one compose file to `registry/name:version@digest`. */
export function renderCompose(text, { version, digests }) {
  requireVersion(version);
  for (const name of releaseImages)
    if (!digestPattern.test(digests?.[name] ?? ''))
      throw new Error(`Missing or malformed digest for ${name}; expected sha256:<64 hex>.`);
  const lines = text.split('\n').map((line) => {
    const image = line.match(imageLine);
    if (!image) return line;
    const { prefix, reference, suffix } = splitImage(image[3]);
    const own = passdownImage(reference);
    if (!own) return line;
    if (!releaseImages.includes(own.name)) throw new Error(`Unknown Passdown image ${own.name}.`);
    if (own.tag !== version)
      throw new Error(
        `${reference} is not tagged ${version}; the source version must match the release.`,
      );
    const pinned = `${registry}/${own.name}:${version}@${digests[own.name]}`;
    return `${image[1]}${image[2]}${prefix}${pinned}${suffix}${image[2]}`;
  });
  // The development header points at source builds; a release file does not.
  while (lines[0]?.startsWith('#') && /Development candidate|init\.sh --build/.test(lines[0]))
    lines.shift();
  return [
    `# Passdown ${version}. Every image is pinned by digest. Upgrade with upgrade.sh;`,
    '# see https://github.com/nanwer/passdown/tree/main/docs/self-hosting',
    ...lines,
  ].join('\n');
}

/** Problems that make a rendered compose file unfit to ship (T27). */
export function composeProblems(text, { version }) {
  const problems = [];
  if (buildKey.test(text)) problems.push('contains a build: key');
  let images = 0;
  for (const line of text.split('\n')) {
    const image = line.match(imageLine);
    if (!image) continue;
    images++;
    const { reference, unresolved } = splitImage(image[3]);
    if (unresolved) {
      problems.push(`${unresolved} has no digest-pinned default`);
      continue;
    }
    const pinned = reference.match(pinnedReference);
    if (!pinned) {
      problems.push(`${reference} is not pinned as name:tag@sha256:<digest>`);
      continue;
    }
    const own = passdownImage(reference);
    if (own && (!releaseImages.includes(own.name) || own.tag !== version))
      problems.push(`${reference} is not a ${version} Passdown image`);
  }
  if (!images) problems.push('names no images');
  return problems;
}

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

/** Write the release files into an empty or new directory, then check them. */
export function renderReleaseAssets({ source, output, version, digests }) {
  requireVersion(version);
  if (existsSync(output) && readdirSync(output).length)
    throw new Error(`The output directory must be empty: ${output}`);
  const rendered = Object.fromEntries(
    composeFiles.map((file) => [
      file,
      renderCompose(readFileSync(join(source, file), 'utf8'), { version, digests }),
    ]),
  );
  mkdirSync(output, { recursive: true, mode: 0o755 });
  for (const [file, text] of Object.entries(rendered))
    writeFileSync(join(output, file), text, { mode: 0o644, flag: 'wx' });
  for (const file of scripts) copyFileSync(join(source, file), join(output, file));
  writeFileSync(
    join(output, 'SHA256SUMS'),
    releaseFiles.map((file) => `${sha256(join(output, file))}  ${file}\n`).join(''),
    { mode: 0o644, flag: 'wx' },
  );
  const problems = releaseAssetProblems(output, { version });
  if (problems.length)
    throw new Error(`Rendered assets failed their check:\n${problems.join('\n')}`);
  return releaseFiles;
}

/** Problems with a rendered release directory: its file list, pins and checksums. */
export function releaseAssetProblems(dir, { version }) {
  const problems = [];
  const present = readdirSync(dir).sort();
  const expected = [...releaseFiles, 'SHA256SUMS'].sort();
  for (const file of present)
    if (!expected.includes(file)) problems.push(`${file}: not a release file`);
  for (const file of expected) if (!present.includes(file)) problems.push(`${file}: missing`);
  for (const file of composeFiles)
    if (present.includes(file))
      for (const problem of composeProblems(readFileSync(join(dir, file), 'utf8'), { version }))
        problems.push(`${file}: ${problem}`);
  if (present.includes('SHA256SUMS')) {
    const listed = new Map();
    for (const line of readFileSync(join(dir, 'SHA256SUMS'), 'utf8').split('\n').filter(Boolean)) {
      const entry = line.match(/^([0-9a-f]{64}) {2}([A-Za-z0-9._-]+)$/);
      if (entry) listed.set(entry[2], entry[1]);
      else problems.push(`SHA256SUMS: malformed line`);
    }
    for (const file of releaseFiles) {
      if (!listed.has(file)) problems.push(`SHA256SUMS: ${file} is not listed`);
      else if (present.includes(file) && listed.get(file) !== sha256(join(dir, file)))
        problems.push(`${file}: does not match SHA256SUMS`);
    }
    for (const file of listed.keys())
      if (!releaseFiles.includes(file)) problems.push(`SHA256SUMS: lists ${file}`);
  }
  return problems;
}

function main(argv) {
  const options = { digests: {} };
  for (let i = 0; i < argv.length; i += 2) {
    const [flag, value] = [argv[i], argv[i + 1]];
    if (value === undefined) throw new Error(`${flag} needs a value.`);
    if (flag === '--version') options.version = value;
    else if (flag === '--output') options.output = resolve(value);
    else if (flag === '--check') options.check = resolve(value);
    else if (flag === '--source') options.source = resolve(value);
    else if (flag === '--digest') {
      const [name, digest] = value.split('=');
      options.digests[name] = digest;
    } else throw new Error(`Unknown option ${flag}.`);
  }
  requireVersion(options.version);
  if (options.check) {
    const problems = releaseAssetProblems(options.check, options);
    if (problems.length) {
      for (const problem of problems) console.error(problem);
      return 1;
    }
    console.log(`Release assets in ${options.check} are pinned and match SHA256SUMS.`);
    return 0;
  }
  if (!options.output) throw new Error('--output or --check is required.');
  const source = options.source ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'deploy');
  renderReleaseAssets({ ...options, source });
  for (const file of composeFiles)
    for (const line of readFileSync(join(options.output, file), 'utf8').split('\n'))
      if (imageLine.test(line)) console.log(`${file}:${line.replace(/^\s*image:\s*/, ' ')}`);
  process.stdout.write(readFileSync(join(options.output, 'SHA256SUMS'), 'utf8'));
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
