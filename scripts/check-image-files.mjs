import { readdirSync, unlinkSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

function sourceOrNotes(name) {
  return (
    /(?:\.ts|\.tsx|\.mts|\.cts|\.(?:test|spec)\.[^.]+)$/i.test(name) ||
    (/\.md$/i.test(name) &&
      !/^(?:licen[sc]e(?:[.-].*)?|notices?(?:[.-].*)?|copying(?:[.-].*)?|third[-_]party[-_]notices)\.md$/i.test(
        name,
      ))
  );
}
function privateName(name) {
  return (
    /^\.(?:env|media|private|passdown-settings)(?:[.-]|$)/i.test(name) ||
    /(?:\.env|\.renew-lock|\.dump)$/i.test(name)
  );
}

// Dependency packages carry declarations and README files that aren't runtime
// inputs. Keep all licensing notices; never silently remove private data.
function check(root, base = root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    const parts = relative(base, path).split(sep);
    // Next's runtime has a narrow layout. Never hide a broad trace by
    // silently deleting authored JS, configuration, or other build inputs.
    const expectedWebLocation =
      parts[2]?.startsWith('.next') ||
      ['node_modules', 'public'].includes(parts[2]) ||
      (parts.length === 3 && entry.isFile() && ['server.js', 'package.json'].includes(parts[2]));
    if (parts[0] === 'apps' && parts[1] === 'web' && parts.length >= 3 && !expectedWebLocation)
      throw new Error('Unexpected authored file in the runtime image.');
    if (privateName(entry.name)) throw new Error('Unexpected file in the runtime image.');
    if (sourceOrNotes(entry.name)) {
      if (
        process.argv.includes('--prune-metadata') &&
        entry.isFile() &&
        path.split(sep).includes('node_modules')
      )
        unlinkSync(path);
      else throw new Error('Unexpected file in the runtime image.');
    } else if (entry.isDirectory()) check(path, base);
  }
}
try {
  check(process.argv[2] || '/app');
} catch {
  console.error('Unexpected file or unreadable directory in the runtime image.');
  process.exitCode = 1;
}
