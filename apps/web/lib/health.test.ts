import { describe, expect, it, vi } from 'vitest';
import { passdownVersion } from '@guide/contracts';
import { healthReport, type HealthProbes } from './health';

function probes(overrides: Partial<HealthProbes> = {}): HealthProbes {
  return {
    sample: () => false,
    configured: () => true,
    database: vi.fn(async () => true),
    schema: vi.fn(async () => 'current' as const),
    media: vi.fn(async () => 'ok' as const),
    setupRequired: vi.fn(async () => false),
    ...overrides,
  };
}

describe('health', () => {
  it('reports each situation in precedence order', async () => {
    const cases: [Partial<HealthProbes>, number, Record<string, unknown>][] = [
      [{ sample: () => true }, 200, { status: 'ready', mode: 'sample' }],
      [{ configured: () => false }, 503, { status: 'not-configured' }],
      [{ database: async () => false }, 503, { status: 'unavailable', mode: 'persistent' }],
      [{ schema: async () => 'behind' }, 503, { status: 'schema-behind', schema: 'behind' }],
      [
        { media: async () => 'unavailable' },
        503,
        { status: 'media-unavailable', media: 'unavailable' },
      ],
      [{ setupRequired: async () => true }, 200, { status: 'setup-required', media: 'ok' }],
      [{}, 200, { status: 'ready', mode: 'persistent', schema: 'current', media: 'ok' }],
      [{ schema: async () => 'ahead' }, 200, { status: 'ready', schema: 'ahead' }],
    ];
    for (const [overrides, status, body] of cases) {
      const report = await healthReport(probes(overrides));
      expect(report.status, JSON.stringify(body)).toBe(status);
      expect(report.body).toMatchObject({ ...body, version: passdownVersion });
    }
  });
  it('stops at the first situation that decides the answer', async () => {
    const p = probes({ database: vi.fn(async () => false) });
    await healthReport(p);
    expect(p.schema).not.toHaveBeenCalled();
    expect(p.media).not.toHaveBeenCalled();
    expect(p.setupRequired).not.toHaveBeenCalled();
  });
  it('never publishes migration names, commands or configuration details', async () => {
    const report = await healthReport(probes({ schema: async () => 'behind' }));
    expect(Object.keys(report.body).sort()).toEqual(['mode', 'schema', 'status', 'version']);
  });
});
