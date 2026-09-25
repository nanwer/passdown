import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mediaFileName } from '@guide/contracts';
import { servedImageWidths } from '@guide/content';
import { readFile, rm } from 'node:fs/promises';
import { discardStoredAsset, readStoredAsset } from './media';
vi.mock('server-only', () => ({}));
vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
  readFile: vi.fn(async () => Buffer.from('cached synthetic picture')),
  rm: vi.fn(async () => {}),
}));
const workspace = 'repair-collective';
const asset = '11111111-1111-4111-8111-111111111111';
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
describe('web storage and shared backup filename parity', () => {
  it.each(['.media', '/var/lib/passdown/media'])(
    'uses canonical display and rendition names under %s',
    async (root) => {
      vi.stubEnv('GUIDE_MEDIA_ROOT', root);
      await readStoredAsset(workspace, asset);
      expect(readFile).toHaveBeenLastCalledWith(join(root, mediaFileName(workspace, asset)));
      for (const width of servedImageWidths) {
        await readStoredAsset(workspace, asset, width);
        expect(readFile).toHaveBeenLastCalledWith(
          join(root, mediaFileName(workspace, asset, `w${width}`)),
        );
      }
      await discardStoredAsset(workspace, asset);
      expect(vi.mocked(rm).mock.calls.map(([path]) => path)).toEqual([
        join(root, mediaFileName(workspace, asset)),
        ...servedImageWidths.map((width) =>
          join(root, mediaFileName(workspace, asset, `w${width}`)),
        ),
      ]);
    },
  );
});
