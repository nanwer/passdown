import { spawn } from 'node:child_process';
import type { Readable, Writable } from 'node:stream';
import { finished, pipeline } from 'node:stream/promises';

/** Stderr is opt-in diagnostic data: never include it in generic CLI logging. */
export class ToolFailure extends Error {
  declare readonly tool: string;
  declare readonly exitCode: number | null;
  declare readonly stderrTail: string;

  constructor(tool: string, exitCode: number | null, stderrTail: string) {
    super(`External tool failed (${exitCode === null ? 'terminated' : `exit ${exitCode}`}).`);
    this.name = 'ToolFailure';
    Object.defineProperties(this, {
      tool: { value: tool },
      exitCode: { value: exitCode },
      stderrTail: { value: stderrTail },
    });
  }
}

export async function runTool(
  tool: string,
  args: string[],
  options: {
    env: Record<string, string | undefined>;
    input?: Readable;
    output?: Writable;
    signal: AbortSignal;
  },
): Promise<void> {
  options.signal.throwIfAborted();
  const child = spawn(tool, args, {
    // Node accepts a sparse environment; framework typings may require NODE_ENV.
    env: options.env as NodeJS.ProcessEnv,
    shell: false,
    stdio: [options.input ? 'pipe' : 'ignore', options.output ? 'pipe' : 'ignore', 'pipe'],
  });
  let tail = Buffer.alloc(0);
  child.stderr!.on('data', (chunk: Buffer) => {
    tail = Buffer.from(Buffer.concat([tail, chunk]).subarray(-8192));
  });
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const stop = () => {
    if (child.exitCode !== null || child.signalCode !== null || killTimer) return;
    child.kill('SIGTERM');
    killTimer = setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    }, 5000);
    killTimer.unref();
  };
  const abort = () => {
    stop();
    // A source may never emit another byte. Release both pipelines on abort,
    // but still await the child's close and every destination's completion.
    options.input?.destroy();
    options.output?.destroy();
    child.stdin?.destroy();
    child.stdout?.destroy();
  };
  let spawnError: NodeJS.ErrnoException | undefined;
  const exited = new Promise<number | null>((resolve) => {
    child.once('error', (error: NodeJS.ErrnoException) => {
      spawnError = error;
    });
    child.once('close', (code) => resolve(code));
  });
  const flowErrors: NodeJS.ErrnoException[] = [];
  const track = (flow: Promise<void>) =>
    flow.catch((error: NodeJS.ErrnoException) => {
      flowErrors.push(error);
      stop();
    });
  const flows = [
    track(finished(child.stderr!, { cleanup: true })),
    ...(options.input ? [track(pipeline(options.input, child.stdin!))] : []),
    ...(options.output ? [track(pipeline(child.stdout!, options.output))] : []),
  ];
  options.signal.addEventListener('abort', abort, { once: true });
  if (options.signal.aborted) abort();
  try {
    const [code] = await Promise.all([exited, Promise.all(flows)]);
    options.signal.throwIfAborted();
    const brokenPipe = (error: NodeJS.ErrnoException) =>
      ['EPIPE', 'ERR_STREAM_PREMATURE_CLOSE'].includes(error.code ?? '');
    const meaningfulFlowError = flowErrors.find((error) => !brokenPipe(error));
    if (meaningfulFlowError) throw meaningfulFlowError;
    if (spawnError) {
      // Node's original spawn error retains spawnargs, which may be sensitive.
      throw Object.assign(new Error('External tool could not be started.'), {
        code: spawnError.code,
      });
    }
    // Decode first, then bound the encoded diagnostic as malformed UTF-8
    // replacement characters can expand the raw byte count.
    const decoded = Buffer.from(tail.toString('utf8')).subarray(-8192);
    let start = 0;
    while (start < decoded.length && (decoded[start]! & 0xc0) === 0x80) start++;
    if (code !== 0) throw new ToolFailure(tool, code, decoded.subarray(start).toString('utf8'));
    if (flowErrors[0]) throw flowErrors[0];
  } finally {
    options.signal.removeEventListener('abort', abort);
    if (killTimer) clearTimeout(killTimer);
  }
}
