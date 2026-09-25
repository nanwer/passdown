import type { ConnectionPolicy } from '@guide/database';
import type { Readable, Writable } from 'node:stream';
export type OperatorNeed = 'owner' | 'runtime' | 'origin' | 'media';
export type OperatorInput = { args: string[]; options: Record<string, string | boolean> };
export type OperatorContext = {
  ownerURL?: string;
  runtimeURL?: string;
  origin?: string;
  mediaRoot?: string;
  policy: ConnectionPolicy;
  migrationsDirectory: string;
  /** The source revision this build came from, when known. */
  revision?: string | null;
  out: (message: string) => void;
  info: (message: string) => void;
  stdin: Readable;
  stdout: Writable;
  signal: AbortSignal;
};
export type OperatorCommand = {
  name: string;
  summary: string;
  usage: string;
  options?: Record<string, { type: 'string' | 'boolean'; required?: boolean }>;
  needs: readonly OperatorNeed[] | ((input: OperatorInput) => readonly OperatorNeed[]);
  validate?: (input: OperatorInput) => boolean;
  /** Commands must opt into positional arguments, keeping typos fail-closed. */
  arguments?: { min: number; max: number };
  run: (input: OperatorInput, context: OperatorContext) => Promise<void>;
};
export class OperatorFailure extends Error {
  constructor(
    message: string,
    readonly exitCode: 1 | 4 = 1,
  ) {
    super(message);
    this.name = 'OperatorFailure';
  }
}
