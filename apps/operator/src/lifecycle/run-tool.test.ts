import { Readable, Writable, PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { runTool, ToolFailure } from './run-tool';

const options = () => ({ env: {}, signal: new AbortController().signal });
const node = (source: string, extra = {}) =>
  runTool(process.execPath, ['-e', source], { ...options(), ...extra });

describe('subprocess stream lifecycle', () => {
  it('waits for destination finalization after the child has exited', async () => {
    let finish!: () => void;
    let finishing!: () => void;
    const reachedFinal = new Promise<void>((resolve) => {
      finishing = resolve;
    });
    const chunks: Buffer[] = [];
    const output = new Writable({
      write(chunk, _encoding, done) {
        chunks.push(Buffer.from(chunk));
        done();
      },
      final(done) {
        finish = done;
        finishing();
      },
    });
    let settled = false;
    const running = node('process.stdout.write("complete")', { output }).then(() => {
      settled = true;
    });
    await reachedFinal;
    expect(settled).toBe(false);
    finish();
    await running;
    expect(Buffer.concat(chunks).toString()).toBe('complete');
  });

  it('waits for the child after its output stream has finished', async () => {
    const input = new PassThrough();
    let finalized!: () => void;
    const final = new Promise<void>((resolve) => {
      finalized = resolve;
    });
    const output = new Writable({
      write(_chunk, _encoding, done) {
        done();
      },
      final(done) {
        done();
        finalized();
      },
    });
    let settled = false;
    const running = node(
      'process.stdout.end(); process.stdin.resume(); process.stdin.on("end", () => process.exit(0))',
      { input, output },
    ).then(() => {
      settled = true;
    });
    await final;
    expect(settled).toBe(false);
    input.end();
    await running;
  });

  it('bounds malformed UTF-8 diagnostics after decoding too', async () => {
    const failure = (await node(
      'process.stderr.write(Buffer.alloc(20000, 255), () => process.exit(2))',
    ).catch((error: unknown) => error)) as ToolFailure;
    expect(Buffer.byteLength(failure.stderrTail)).toBeLessThanOrEqual(8192);
  });

  it('pipes input and output without a shell interpreting arguments', async () => {
    const chunks: Buffer[] = [];
    const output = new Writable({
      write(chunk, _encoding, done) {
        chunks.push(Buffer.from(chunk));
        done();
      },
    });
    await runTool(
      process.execPath,
      [
        '-e',
        'process.stdin.pipe(process.stdout); process.stdout.write(process.argv[1])',
        '$(echo unsafe); *',
      ],
      {
        ...options(),
        input: Readable.from(['payload']),
        output,
      },
    );
    expect(Buffer.concat(chunks).toString()).toBe('$(echo unsafe); *payload');
  });

  it('returns output ENOSPC rather than the child termination it causes', async () => {
    const error = Object.assign(new Error('destination full'), { code: 'ENOSPC' });
    const output = new Writable({
      write(_chunk, _encoding, done) {
        done(error);
      },
    });
    await expect(
      node('setInterval(() => process.stdout.write("data"), 1)', { output }),
    ).rejects.toBe(error);
  });

  it('stops the child when input fails', async () => {
    const error = Object.assign(new Error('source failed'), { code: 'EIO' });
    const input = new Readable({
      read() {
        this.destroy(error);
      },
    });
    await expect(
      node('process.stdin.resume(); setInterval(() => {}, 1000)', { input }),
    ).rejects.toBe(error);
  });

  it('prefers nonzero tool status and stderr over its broken input pipe', async () => {
    const input = new Readable({
      read() {
        this.push(Buffer.alloc(65536));
      },
    });
    const failure = await node('process.stderr.write("database refused", () => process.exit(7))', {
      input,
    }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(ToolFailure);
    expect(failure).toMatchObject({ exitCode: 7, stderrTail: 'database refused' });
  });

  it('keeps only the last 8KiB of stderr and excludes diagnostics from generic logging', async () => {
    const secret = 'synthetic-password';
    const failure = (await node(
      'process.stderr.write("x".repeat(20000) + process.env.PGPASSWORD, () => process.exit(9))',
      {
        env: { PGPASSWORD: secret },
      },
    ).catch((error: unknown) => error)) as ToolFailure;
    expect(failure).toBeInstanceOf(ToolFailure);
    expect(Buffer.byteLength(failure.stderrTail)).toBeLessThanOrEqual(8192);
    expect(failure.stderrTail.endsWith(secret)).toBe(true);
    expect(String(failure)).not.toContain(secret);
    expect(JSON.stringify(failure)).not.toContain(secret);
  });

  it.each([false, true])(
    'reports missing executables safely with piped streams=%s',
    async (piped) => {
      const failure = (await runTool('/nonexistent/passdown-tool', ['synthetic-secret'], {
        ...options(),
        ...(piped ? { input: Readable.from(['data']), output: new PassThrough() } : {}),
      }).catch((error: unknown) => error)) as Error;
      expect(failure).toMatchObject({ code: 'ENOENT' });
      expect(String(failure)).not.toContain('synthetic-secret');
      expect(JSON.stringify(failure)).not.toContain('synthetic-secret');
    },
  );

  it('rejects a pre-aborted signal without consuming input', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled');
    controller.abort(reason);
    let consumed = false;
    const input = new Readable({
      read() {
        consumed = true;
      },
    });
    await expect(node('process.exit(0)', { signal: controller.signal, input })).rejects.toBe(
      reason,
    );
    expect(consumed).toBe(false);
  });

  it('kills a child that ignores TERM and closes pending input on abort', async () => {
    const controller = new AbortController();
    const reason = new Error('cancelled');
    const input = new PassThrough();
    const output = new Writable({
      write(_chunk, _encoding, done) {
        done();
        controller.abort(reason);
      },
    });
    await expect(
      node(
        'process.on("SIGTERM", () => {}); process.stdout.write("ready"); setInterval(() => {}, 1000)',
        {
          signal: controller.signal,
          input,
          output,
        },
      ),
    ).rejects.toBe(reason);
    expect(input.destroyed).toBe(true);
    expect(output.destroyed).toBe(true);
  }, 10000);
});
