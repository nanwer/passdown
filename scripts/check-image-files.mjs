import { readdirSync, unlinkSync } from 'node:fs';
import { join, sep } from 'node:path';

function sourceOrNotes(name) {
  return (
    /(?:\.ts|\.tsx|\.test\.[^.]+)$/i.test(name) ||
    (/\.md$/i.test(name) &&
      !/^(?:licen[sc]e(?:[.-].*)?|notice(?:[.-].*)?|third_party_notices)\.md$/i.test(name))
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
function check(root) {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (privateName(entry.name)) throw new Error('Unexpected file in the runtime image.');
    if (sourceOrNotes(entry.name)) {
      if (
        process.argv.includes('--prune-metadata') &&
        entry.isFile() &&
        path.split(sep).includes('node_modules')
      )
        unlinkSync(path);
      else throw new Error('Unexpected file in the runtime image.');
    } else if (entry.isDirectory()) check(path);
  }
}
try {
  check(process.argv[2] || '/app');
} catch {
  console.error('Unexpected file or unreadable directory in the runtime image.');
  process.exitCode = 1;
}
