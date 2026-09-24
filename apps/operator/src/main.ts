import { fileURLToPath } from 'node:url';
import { runCli } from './cli';
import { commands } from './commands';
declare const __PASSDOWN_BUNDLE__: boolean;
const bundled = typeof __PASSDOWN_BUNDLE__ !== 'undefined' && __PASSDOWN_BUNDLE__;
const controller = new AbortController();
let interruption: ReturnType<typeof setTimeout> | undefined;
function interrupt() {
  controller.abort();
  interruption ??= setTimeout(() => {
    process.stderr.write(
      'The command was interrupted. Check installation status before retrying.\n',
    );
    process.exit(1);
  }, 5000);
  interruption.unref();
}
process.once('SIGINT', interrupt);
process.once('SIGTERM', interrupt);
process.exitCode = await runCli(
  process.argv.slice(2),
  {
    out: (line) => process.stdout.write(`${line}\n`),
    info: (line) => process.stderr.write(`${line}\n`),
    stdin: process.stdin,
    stdout: process.stdout,
    signal: controller.signal,
    env: process.env,
    migrationsDirectory: fileURLToPath(
      new URL(
        bundled ? './migrations/' : '../../../packages/database/migrations/',
        import.meta.url,
      ),
    ),
  },
  commands,
);

if (interruption) clearTimeout(interruption);
