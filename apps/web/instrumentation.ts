/** Runs once when the server starts: see lib/startup.ts. */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
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
