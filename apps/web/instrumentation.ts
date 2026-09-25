/** Runs once when the server starts: see lib/startup.ts. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  // Before anything reads the configuration: the Docker install names secret
  // files, and this turns them into the settings the application reads. A
  // problem leaves them unresolved for the startup report to name.
  const { applySecretFiles } = await import('@guide/database');
  applySecretFiles(process.env);
  const { reportStartup } = await import('./lib/startup');
  await reportStartup();
}

/** Page and server-action failures, logged with the reference the error page shows. */
export async function onRequestError(
  ...args: Parameters<typeof import('./lib/log').logRenderError>
) {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { logRenderError } = await import('./lib/log');
  logRenderError(...args);
}
