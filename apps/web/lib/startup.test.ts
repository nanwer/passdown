import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

const h = vi.hoisted(() => ({
  status: {
    production: true,
    problems: [] as { variable: string; message: string }[],
    previewIgnored: false,
    setupCodeHash: Buffer.alloc(32, 7) as Buffer | undefined,
  },
  configured: true,
  schemaMessage: null as string | null,
  driftMessage: null as string | null,
  schemaError: null as Error | null,
  media: 'ok' as 'ok' | 'unavailable',
  setupRequired: true,
}));
vi.mock('server-only', () => ({}));
vi.mock('./deployment', () => ({
  deploymentStatus: () => h.status,
  sampleLibraryEnabled: () => false,
}));
vi.mock('./application', () => ({
  isConfigured: () => h.configured,
  getApplication: () => ({
    origin: 'https://guides.example.org',
    store: {
      schemaState: async () => {
        if (h.schemaError) throw h.schemaError;
        return {};
      },
    },
  }),
}));
vi.mock('@guide/database', () => ({
  describeSchemaState: () => h.schemaMessage,
  describeSchemaDrift: () => h.driftMessage,
}));
vi.mock('./media', () => ({ mediaStatus: async () => h.media }));
vi.mock('./setup', () => ({ setupRequired: async () => h.setupRequired }));

import { reportStartup } from './startup';

type Entry = Record<string, unknown> & { level: string; event: string };
let spy: MockInstance<typeof console.error>;
const entries = (): Entry[] => spy.mock.calls.map((call) => JSON.parse(String(call[0])) as Entry);
beforeEach(() => {
  spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  h.status = {
    production: true,
    problems: [],
    previewIgnored: false,
    setupCodeHash: Buffer.alloc(32, 7),
  };
  Object.assign(h, {
    configured: true,
    schemaMessage: null,
    driftMessage: null,
    schemaError: null,
    media: 'ok',
    setupRequired: true,
  });
});
afterEach(() => vi.restoreAllMocks());

describe('startup report', () => {
  it('summarises the installation in one line without the setup code hash', async () => {
    await reportStartup();
    const startup = entries().find((entry) => entry.event === 'startup');
    expect(startup).toMatchObject({
      level: 'info',
      mode: 'production',
      origin: 'https://guides.example.org',
      schema: 'current',
      media: 'ok',
      setup: 'required',
      setupCode: 'configured',
    });
    expect(startup?.version).toEqual(expect.any(String));
    expect(JSON.stringify(entries())).not.toContain(Buffer.alloc(32, 7).toString('hex'));
  });
  it('names a schema mismatch, unusable pictures and invalid settings as their own lines', async () => {
    h.status.problems = [
      { variable: 'BETTER_AUTH_URL', message: 'BETTER_AUTH_URL must be an https origin.' },
    ];
    h.schemaMessage = 'Apply 031_example.sql with ./upgrade.sh.';
    h.media = 'unavailable';
    h.status.setupCodeHash = undefined;
    await reportStartup();
    const events = entries().map((entry) => `${entry.level}:${entry.event}`);
    expect(events).toEqual(
      expect.arrayContaining([
        'error:config.invalid',
        'error:schema.behind',
        'error:media.unavailable',
      ]),
    );
    expect(entries().find((entry) => entry.event === 'startup')).toMatchObject({
      schema: 'behind',
      media: 'unavailable',
      setup: 'unknown',
      setupCode: 'missing',
    });
  });
  it('reports an unreachable database without guessing at the schema', async () => {
    h.schemaError = new Error('connect ECONNREFUSED postgresql://guide_runtime:pw@db:5432/x');
    await reportStartup();
    const unreachable = entries().find((entry) => entry.event === 'database.unreachable');
    expect(unreachable).toBeDefined();
    expect(JSON.stringify(unreachable)).not.toContain('pw@db');
    expect(entries().find((entry) => entry.event === 'startup')).toMatchObject({
      schema: 'unreadable',
    });
  });
});
