import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { migrateCommand } from './commands/migrate';
import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { runCli } from './cli';
import { OperatorFailure, type OperatorCommand } from './command';
const make = (change: Partial<OperatorCommand> = {}) =>
  ({
    name: 'inspect',
    summary: 'Inspect installation',
    usage: 'inspect [--json]',
    needs: [],
    options: { json: { type: 'boolean' as const } },
    run: vi.fn(async () => {}),
    ...change,
  }) satisfies OperatorCommand;
const harness = (env: Record<string, string> = {}) => {
  const out: string[] = [],
    info: string[] = [];
  return {
    out,
    info,
    io: {
      out: (s: string) => out.push(s),
      info: (s: string) => info.push(s),
      env,
      stdin: new PassThrough(),
      stdout: new PassThrough(),
      signal: new AbortController().signal,
      migrationsDirectory: '/test/migrations',
    },
  };
};
describe('operator command boundary', () => {
  it('prints discoverable help without database settings', async () => {
    const h = harness();
    const status = await runCli(['help'], h.io, [make()]);
    expect({ status, help: h.out.join('\n').includes('inspect'), errors: h.info }).toEqual({
      status: 0,
      help: true,
      errors: [],
    });
  });
  it.each([['missing'], ['inspect', 'extra'], ['inspect', '--secret'], ['inspect', '--json=yes']])(
    'refuses invalid arguments %j',
    async (...args) => {
      const h = harness();
      const c = make();
      const status = await runCli(args, h.io, [c]);
      expect({
        status,
        runs: vi.mocked(c.run).mock.calls.length,
        output: h.out,
        errors: h.info.length,
      }).toEqual({ status: 2, runs: 0, output: [], errors: 1 });
    },
  );
  it('refuses missing configuration before calling a command', async () => {
    const h = harness();
    const c = make({ needs: ['owner'] });
    const status = await runCli(['inspect'], h.io, [c]);
    expect({ status, runs: vi.mocked(c.run).mock.calls.length, error: h.info.join('') }).toEqual({
      status: 3,
      runs: 0,
      error: 'GUIDE_OWNER_DATABASE_URL: is not set.',
    });
  });
  it('does not echo unsafe configuration values', async () => {
    const h = harness({ GUIDE_OWNER_DATABASE_URL: 'secret-value' });
    const c = make({ needs: ['owner'] });
    const status = await runCli(['inspect'], h.io, [c]);
    expect({ status, output: h.info.join('') }).toEqual({
      status: 3,
      output: 'GUIDE_OWNER_DATABASE_URL: must be a PostgreSQL URL.',
    });
  });
  it.each([1, 4] as const)(
    'preserves intentional exit %i and keeps errors off stdout',
    async (code) => {
      const h = harness();
      const c = make({
        run: async () => {
          throw new OperatorFailure('Operation refused.', code);
        },
      });
      const status = await runCli(['inspect'], h.io, [c]);
      expect({ status, out: h.out, info: h.info }).toEqual({
        status: code,
        out: [],
        info: ['Operation refused.'],
      });
    },
  );
  it('does not print unexpected infrastructure errors or credentials', async () => {
    const h = harness();
    const c = make({
      run: async () => {
        throw Error('postgres://owner:secret@host/db');
      },
    });
    const status = await runCli(['inspect'], h.io, [c]);
    expect({ status, out: h.out, info: h.info }).toEqual({
      status: 1,
      out: [],
      info: ['The command failed. Check database availability and configuration.'],
    });
  });
  it('passes validated configuration, arguments and streams to commands', async () => {
    const h = harness({
      NODE_ENV: 'production',
      GUIDE_OWNER_DATABASE_URL: 'postgres://owner:password@postgres/app',
    });
    const seen: unknown[] = [];
    const c = make({
      needs: ['owner'],
      options: { email: { type: 'string', required: true } },
      run: async (input, context) => {
        seen.push({
          input,
          policy: context.policy,
          ownerURL: context.ownerURL,
          stream: context.stdout === h.io.stdout,
        });
        context.out('Done');
        context.info('Working');
      },
    });
    const status = await runCli(['inspect', '--email', 'person@example.org'], h.io, [c]);
    expect({ status, seen, out: h.out, info: h.info }).toEqual({
      status: 0,
      seen: [
        {
          input: { args: [], options: { email: 'person@example.org' } },
          policy: 'deployment',
          ownerURL: h.io.env.GUIDE_OWNER_DATABASE_URL,
          stream: true,
        },
      ],
      out: ['Done'],
      info: ['Working'],
    });
  });
  it('requires a value for string options', async () => {
    const h = harness();
    const c = make({ options: { email: { type: 'string', required: true } } });
    const statuses = [];
    for (const args of [[], ['--email'], ['--email', '--other']])
      statuses.push(await runCli(['inspect', ...args], h.io, [c]));
    expect({ statuses, runs: vi.mocked(c.run).mock.calls.length }).toEqual({
      statuses: [2, 2, 2],
      runs: 0,
    });
  });
});

it.each(['before', 'during'])(
  'reports interruption %s a command without claiming success',
  async (when) => {
    const h = harness();
    const controller = new AbortController();
    h.io.signal = controller.signal;
    const c = make({
      run: vi.fn(async () => {
        controller.abort();
      }),
    });
    if (when === 'before') controller.abort();
    const status = await runCli(['inspect'], h.io, [c]);
    expect({ status, runs: vi.mocked(c.run).mock.calls.length, out: h.out, info: h.info }).toEqual({
      status: 1,
      runs: when === 'before' ? 0 : 1,
      out: [],
      info: ['The command was interrupted. Check installation status before retrying.'],
    });
  },
);

it('explains migration file mismatches without attempting a database connection', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'passdown-operator-'));
  try {
    const h = harness({
      GUIDE_OWNER_DATABASE_URL: 'postgres://owner:password@127.0.0.1:1/unused',
      GUIDE_DATABASE_URL: 'postgres://guide_runtime:password@127.0.0.1:1/unused',
    });
    h.io.migrationsDirectory = directory;
    const status = await runCli(['migrate'], h.io, [migrateCommand]);
    expect({ status, out: h.out, info: h.info }).toEqual({
      status: 1,
      out: [],
      info: ['Migration files do not match this build. Restore the files shipped with this image.'],
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe('conditional operator configuration', () => {
  it('requires storage settings only for the mutating form of a command', async () => {
    const command = make({
      needs: (input) => (input.options.json ? [] : ['owner']),
      options: { json: { type: 'boolean' } },
    });
    const offline = harness();
    expect(await runCli(['inspect', '--json'], offline.io, [command])).toBe(0);
    const online = harness();
    expect(await runCli(['inspect'], online.io, [command])).toBe(3);
    expect(command.run).toHaveBeenCalledTimes(1);
  });
  it('refuses incompatible options as usage before checking credentials', async () => {
    const command = make({
      needs: ['owner'],
      options: { a: { type: 'boolean' }, b: { type: 'boolean' } },
      validate: (input) => !(input.options.a && input.options.b),
    });
    const h = harness();
    expect(await runCli(['inspect', '--a', '--b'], h.io, [command])).toBe(2);
    expect(command.run).not.toHaveBeenCalled();
  });
});
