import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

const h = vi.hoisted(() => ({
  status: {
    production: true,
    problems: [] as { variable: string; message: string }[],
    previewIgnored: false,
  },
  configured: true,
  schemaMessage: null as string | null,
  driftMessage: null as string | null,
  schemaError: null as Error | null,
  media: 'ok' as 'ok' | 'unavailable',
  setup: 'default-login' as 'default-login' | 'no-account' | 'complete',
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
vi.mock('./setup', () => ({ setupState: async () => h.setup }));

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
  };
  Object.assign(h, {
    configured: true,
    schemaMessage: null,
    driftMessage: null,
    schemaError: null,
    media: 'ok',
    setup: 'default-login',
  });
});
afterEach(() => vi.restoreAllMocks());

describe('startup report', () => {
  it('summarises the installation in one line and warns while the default login works', async () => {
    await reportStartup();
    const startup = entries().find((entry) => entry.event === 'startup');
    expect(startup).toMatchObject({
      level: 'info',
      mode: 'production',
      origin: 'https://guides.example.org',
      schema: 'current',
      media: 'ok',
      setup: 'default-login',
    });
    expect(startup).not.toHaveProperty('setupCode');
    expect(startup?.version).toEqual(expect.any(String));
    expect(entries().find((entry) => entry.event === 'setup.default-login')).toMatchObject({
      level: 'warn',
      message:
        'The default login admin@example.com (password changeme) still works. Open https://guides.example.org, sign in with it and finish setting up.',
    });
  });
  it('does not warn once setup is finished, and names an installation nobody can sign in to', async () => {
    h.setup = 'complete';
    await reportStartup();
    expect(entries().some((entry) => String(entry.event).startsWith('setup.'))).toBe(false);
    spy.mockClear();
    h.setup = 'no-account';
    await reportStartup();
    expect(entries().find((entry) => entry.event === 'setup.no-account')).toMatchObject({
      level: 'error',
    });
  });
  it('names a schema mismatch, unusable pictures and invalid settings as their own lines', async () => {
    h.status.problems = [
      { variable: 'BETTER_AUTH_URL', message: 'BETTER_AUTH_URL must be an https origin.' },
    ];
    h.schemaMessage = 'Apply 031_example.sql with ./upgrade.sh.';
    h.media = 'unavailable';
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
