import { passdownVersion } from '@guide/contracts';

/**
 * What /api/health answers, in precedence order. Each check runs only if every
 * earlier one passed, so an unreachable database is never queried for its
 * schema. The body is public: it names states, never migration names,
 * commands or configuration, which go to the startup log instead.
 */
export type HealthProbes = {
  sample(): boolean;
  configured(): boolean;
  database(): Promise<boolean>;
  schema(): Promise<'current' | 'behind' | 'ahead'>;
  media(): Promise<'ok' | 'unavailable'>;
  setupRequired(): Promise<boolean>;
};
export async function healthReport(probes: HealthProbes) {
  const version = passdownVersion;
  const answer = (status: number, body: Record<string, unknown>) => ({
    status,
    body: { ...body, version },
  });
  if (probes.sample()) return answer(200, { status: 'ready', mode: 'sample' });
  if (!probes.configured()) return answer(503, { status: 'not-configured' });
  const mode = 'persistent';
  if (!(await probes.database())) return answer(503, { status: 'unavailable', mode });
  const schema = await probes.schema();
  if (schema === 'behind') return answer(503, { status: 'schema-behind', mode, schema });
  const media = await probes.media();
  if (media !== 'ok') return answer(503, { status: 'media-unavailable', mode, schema, media });
  // Serving a newer database is reported but allowed: during an upgrade the new
  // version migrates while the old one is still answering.
  if (await probes.setupRequired())
    return answer(200, { status: 'setup-required', mode, schema, media });
  return answer(200, { status: 'ready', mode, schema, media });
}
