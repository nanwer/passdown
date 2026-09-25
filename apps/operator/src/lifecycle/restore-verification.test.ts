import { describe, expect, it } from 'vitest';
import { restoreVerification } from './restore-verification';
import type { BackupManifest } from './manifest';
const id = { workspace: 'w', asset: '11111111-1111-4111-8111-111111111111' };
const other = { ...id, workspace: 'other' };
const manifest = {
  counts: { 'public.auth_user': 2, 'public.auth_session': null },
  migrations: [{ name: '001.sql', checksum: 'a' }],
  media: { missingAtBackup: [id] },
} as unknown as BackupManifest;
const inventory = {
  counts: { 'public.auth_user': 2, 'public.auth_session': 0 },
  migrations: manifest.migrations,
  dangling: [],
};
const media = { checked: 2, missing: [id], damaged: [], orphanFiles: [] };
describe('restored snapshot verification', () => {
  it('allows only the exact missing pairs recorded at backup time', () => {
    expect(restoreVerification(manifest, inventory, media).ok).toBe(true);
    expect(restoreVerification(manifest, inventory, { ...media, missing: [other] })).toMatchObject({
      ok: false,
      unexpectedMissing: [other],
    });
  });
  it('never excuses damage or dangling references using the missing allowance', () => {
    expect(
      restoreVerification(manifest, inventory, {
        ...media,
        damaged: [{ ...id, reason: 'checksum' }],
      }).ok,
    ).toBe(false);
    expect(
      restoreVerification(
        manifest,
        { ...inventory, dangling: [{ ...other, source: 'guide-cover', sourceId: 'g' }] },
        media,
      ).ok,
    ).toBe(false);
  });
  it('requires exact table counts including empty excluded tables and no extra tables', () => {
    for (const counts of [
      { 'public.auth_user': 1, 'public.auth_session': 0 },
      { 'public.auth_user': 2, 'public.auth_session': 1 },
      { 'public.auth_user': 2 },
      { ...inventory.counts, 'app.extra': 0 },
    ] as Record<string, number>[])
      expect(restoreVerification(manifest, { ...inventory, counts }, media).ok).toBe(false);
  });
  it('rejects missing, changed or additional migrations', () => {
    for (const migrations of [
      [],
      [{ name: '001.sql', checksum: 'b' }],
      [...manifest.migrations, { name: '002.sql', checksum: 'c' }],
    ])
      expect(restoreVerification(manifest, { ...inventory, migrations }, media).ok).toBe(false);
  });
});
