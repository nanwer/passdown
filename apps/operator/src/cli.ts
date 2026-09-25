import { buildInfo } from '@guide/contracts';
import { ConfigurationError } from '@guide/database';
import type { Readable, Writable } from 'node:stream';
import { OperatorFailure, type OperatorCommand, type OperatorInput } from './command';
import { readOperatorConfig } from './config';
export type OperatorIO = {
  out: (message: string) => void;
  info: (message: string) => void;
  stdin: Readable;
  stdout: Writable;
  signal: AbortSignal;
  env: Record<string, string | undefined>;
  migrationsDirectory: string;
};
function parse(command: OperatorCommand, argv: string[]): OperatorInput {
  const input: OperatorInput = { args: [], options: {} };
  for (let index = 0; index < argv.length; index++) {
    const token = argv[index]!;
    if (!token.startsWith('-')) {
      input.args.push(token);
      continue;
    }
    const name = token.slice(2),
      option = command.options?.[name];
    if (!token.startsWith('--') || !option || Object.hasOwn(input.options, name))
      throw new Error('usage');
    if (option.type === 'boolean') input.options[name] = true;
    else {
      const value = argv[++index];
      if (!value || value.startsWith('-')) throw new Error('usage');
      input.options[name] = value;
    }
  }
  for (const [name, option] of Object.entries(command.options ?? {}))
    if (option.required && input.options[name] === undefined) throw new Error('usage');
  if (
    input.args.length < (command.arguments?.min ?? 0) ||
    input.args.length > (command.arguments?.max ?? 0)
  )
    throw new Error('usage');
  if (command.validate && !command.validate(input)) throw new Error('usage');
  return input;
}
export async function runCli(
  argv: string[],
  io: OperatorIO,
  commands: readonly OperatorCommand[],
): Promise<number> {
  const [name, ...args] = argv;
  if ((!name || ['help', '--help', '-h'].includes(name)) && args.length === 0) {
    io.out(
      ['Passdown operator commands', ...commands.map((c) => `  ${c.usage} — ${c.summary}`)].join(
        '\n',
      ),
    );
    return 0;
  }
  const command = commands.find((c) => c.name === name);
  if (!command) {
    io.info('Unknown command. Run passdown help for usage.');
    return 2;
  }
  if (args.length === 1 && args[0] === '--help') {
    io.out(`${command.usage}\n${command.summary}`);
    return 0;
  }
  let input: OperatorInput;
  try {
    input = parse(command, args);
  } catch {
    io.info(`Usage: passdown ${command.usage}`);
    return 2;
  }
  try {
    const checkInterrupted = () => {
      if (io.signal.aborted)
        throw new OperatorFailure(
          'The command was interrupted. Check installation status before retrying.',
        );
    };
    checkInterrupted();
    const config = readOperatorConfig(
      typeof command.needs === 'function' ? command.needs(input) : command.needs,
      io.env,
    );
    await command.run(input, {
      ...config,
      out: io.out,
      info: io.info,
      stdin: io.stdin,
      stdout: io.stdout,
      signal: io.signal,
      migrationsDirectory: io.migrationsDirectory,
      revision: buildInfo(io.env).revision,
    });
    checkInterrupted();
    return 0;
  } catch (error) {
    if (error instanceof ConfigurationError) {
      io.info(error.message);
      return 3;
    }
    if (error instanceof OperatorFailure) {
      io.info(error.message);
      return error.exitCode;
    }
    // Only a system or PostgreSQL error code: messages can carry connection
    // strings, but a code such as EACCES or 42P01 says where to look.
    const code = (error as { code?: unknown } | null)?.code;
    const shown = typeof code === 'string' && /^[A-Z0-9_]{2,32}$/.test(code) ? ` (${code})` : '';
    io.info(`The command failed${shown}. Check database availability and configuration.`);
    return 1;
  }
}
