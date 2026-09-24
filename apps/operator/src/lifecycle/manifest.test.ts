import { describe, expect, it } from 'vitest';
import { expectedMigrations } from '@guide/database';
import { validateManifest } from './manifest';

export const sampleManifest = () => ({
  format: 'passdown-backup/1',
  complete: true,
  createdBy: { passdown: '0.1.0-alpha.1', revision: 'abc1234' },
  startedAt: '2026-09-25T10:00:00.000Z',
  snapshotAt: '2026-09-25T10:00:01.000Z',
  completedAt: '2026-09-25T10:00:02.000Z',
  database: { name: 'guide_app', server: '17.6', pgDump: '17.6' },
  migrations: expectedMigrations(),
  counts: {
    'app.guide': 2,
    'public.auth_user': 1,
    'public.auth_session': null,
    'public.auth_verification': null,
    'app.rate_limit': null,
  },
  excludedData: ['public.auth_session', 'public.auth_verification', 'app.rate_limit'],
  credentials: { openResetLinks: null, pendingInvitations: 1 },
  media: { files: 0, bytes: 0, missingAtBackup: [], renditionsIncluded: false },
  files: {
    'database.dump': { bytes: 5, sha256: 'a'.repeat(64) },
    'media.tar': { bytes: 1024, sha256: 'b'.repeat(64) },
  },
});

describe('backup manifest validation', () => {
  it('accepts the complete versioned manifest', () => {
    expect(validateManifest(sampleManifest())).toEqual(sampleManifest());
  });
  it('requires schema-aware reset-link counts', () => {
    const before = {
      ...sampleManifest(),
      credentials: { openResetLinks: 0, pendingInvitations: 1 },
    };
    expect(() => validateManifest(before)).toThrow();
    const after = {
      ...sampleManifest(),
      migrations: [
        ...expectedMigrations(),
        { name: '032_identity_operations.sql', checksum: 'd'.repeat(64) },
      ],
      credentials: { openResetLinks: 0 as number | null, pendingInvitations: 1 },
    };
    expect(validateManifest(after, after.migrations)).toEqual(after);
    after.credentials.openResetLinks = null;
    expect(() => validateManifest(after, after.migrations)).toThrow();
  });
  it.each([
    (m: any) => {
      m.complete = false;
    },
    (m: any) => {
      m.format = 'passdown-backup/2';
    },
    (m: any) => {
      m.extra = 'not allowed';
    },
    (m: any) => {
      m.files['database.dump'].sha256 = 'invalid';
    },
    (m: any) => {
      m.media.bytes = -1;
    },
    (m: any) => {
      m.media.files = 1.5;
    },
    (m: any) => {
      m.credentials.pendingInvitations = Number.MAX_SAFE_INTEGER + 1;
    },
    (m: any) => {
      m.counts['public.auth_session'] = 1;
    },
    (m: any) => {
      m.counts['app.guide'] = null;
    },
    (m: any) => {
      m.excludedData.pop();
    },
    (m: any) => {
      m.completedAt = 'yesterday';
    },
    (m: any) => {
      m.completedAt = '2025-01-01T00:00:00Z';
    },
    (m: any) => {
      m.migrations = m.migrations.slice(1);
    },
    (m: any) => {
      m.migrations = [...m.migrations].reverse();
    },
    (m: any) => {
      m.migrations[0] = { ...m.migrations[0], checksum: 'c'.repeat(64) };
    },
    (m: any) => {
      m.media.missingAtBackup = [{ workspace: '../escape', asset: 'bad' }];
    },
  ])('refuses malformed or incompatible metadata', (change) => {
    const manifest = structuredClone(sampleManifest());
    change(manifest);
    expect(() => validateManifest(manifest)).toThrow();
  });
});
