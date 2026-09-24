import { describe, expect, it } from 'vitest';
import {
  parseDatabaseURL,
  runtimeDatabaseTarget,
  ownerDatabaseTarget,
  pgClientConfig,
  libpqEnvironment,
  identityOrigin,
  authSecret,
} from '../src/config';
describe('connection policy', () => {
  it('decodes one deployment target consistently for both clients', () => {
    const target = runtimeDatabaseTarget(
      'postgresql://guide_runtime:p%40ss@[::1]:5433/a%20b',
      'deployment',
    );
    expect(target).toEqual({
      host: '::1',
      port: 5433,
      database: 'a b',
      user: 'guide_runtime',
      password: 'p@ss',
    });
    expect(pgClientConfig(target)).toEqual({
      ...target,
      ssl: false,
      options: ' ',
      application_name: 'passdown',
      client_encoding: 'UTF8',
      replication: 'false',
      sslnegotiation: 'postgres',
      connectionTimeoutMillis: 10_000,
    });
    expect(libpqEnvironment(target)).toMatchObject({
      PGHOST: '::1',
      PGPORT: '5433',
      PGPASSWORD: 'p@ss',
      PGSSLMODE: 'disable',
    });
    expect(
      runtimeDatabaseTarget('postgres://guide_runtime:secret@database/app', 'deployment').host,
    ).toBe('database');
  });
  it('refuses ambiguous and unsupported forms without disclosing values', () => {
    for (const value of [
      'postgres://u:secret@host/a?sslmode=require',
      'postgres://u:secret@host/a#x',
      'postgres://u:secret@host/a/b',
      'postgres://u:secret@host/a%2Fb',
      'postgres://u:secret@host,other/a',
      'postgres://u@host/a',
      'postgres://u:secret@host/%xx',
    ]) {
      expect(() => parseDatabaseURL(value, 'DB', 'deployment')).toThrow(/DB/);
      try {
        parseDatabaseURL(value, 'DB', 'deployment');
      } catch (error) {
        expect(String(error)).not.toContain('secret');
      }
    }
    expect(() => runtimeDatabaseTarget('postgres://owner:p@localhost/a')).toThrow(/runtime/);
    expect(() => ownerDatabaseTarget('postgres://guide_runtime:p@localhost/a')).toThrow(/owner/);
    expect(() => runtimeDatabaseTarget('postgres://guide_runtime:p@remote/a')).toThrow(/loopback/);
  });
  it('requires safe bare origins and secrets', () => {
    expect(identityOrigin('https://example.org', 'deployment')).toBe('https://example.org');
    expect(identityOrigin('http://localhost:3100', 'deployment')).toBe('http://localhost:3100');
    for (const value of [
      'http://example.org',
      'https://example.org/path',
      'https://u:p@example.org',
    ])
      expect(() => identityOrigin(value, 'deployment')).toThrow();
    expect(() => authSecret('short')).toThrow(/secret/);
  });
});

it('does not inherit ambient PostgreSQL startup settings', async () => {
  const { default: pg } = await import('pg');
  const keys = {
    PGOPTIONS: '-c default_transaction_isolation=serializable',
    PGAPPNAME: 'ambient-name',
    PGCLIENT_ENCODING: 'LATIN1',
    PGREPLICATION: 'database',
    PGSSLNEGOTIATION: 'direct',
  };
  const saved = Object.fromEntries(Object.keys(keys).map((key) => [key, process.env[key]]));
  Object.assign(process.env, keys);
  try {
    const client = new pg.Client(
      pgClientConfig(parseDatabaseURL('postgres://owner:password@localhost/app', 'DB', 'loopback')),
    );
    const parameters = (client as unknown as { connectionParameters: Record<string, unknown> })
      .connectionParameters;
    expect({
      options: parameters.options,
      application_name: parameters.application_name,
      client_encoding: parameters.client_encoding,
      replication: parameters.replication,
      sslnegotiation: parameters.sslnegotiation,
    }).toEqual({
      options: ' ',
      application_name: 'passdown',
      client_encoding: 'UTF8',
      replication: 'false',
      sslnegotiation: 'postgres',
    });
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
