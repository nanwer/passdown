export const root: string;
export function readConfig(): Record<string, string>;
export function initializeConfig(): Record<string, string>;
export function writeAccess(config: Record<string, string>): void;
