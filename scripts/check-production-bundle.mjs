import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

const directory = join(process.argv[2] || 'apps/web/.next', 'static');
async function inspect(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) await inspect(child);
    else if (/\.(js|html|json)$/.test(entry.name)) {
      const text = await readFile(child, 'utf8');
      if (/LOCAL_ACCESS|pnpm local/.test(text)) {
        throw new Error('Production client bundle contains development-only instructions.');
      }
    }
  }
}
await inspect(directory);
console.log('Production client bundle verified.');
