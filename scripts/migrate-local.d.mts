export function requireLocal(url: string, database?: string): URL;
export function migrate(connectionString: string, runtimeURL: string): Promise<void>;
