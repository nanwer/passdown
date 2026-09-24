/**
 * Runs once when the server starts.
 *
 * The application never applies migrations itself — that stays an explicit
 * step so a rollout cannot race and an operator decides when the schema
 * changes. But it must not quietly serve a database it does not match: the
 * symptom of that is an unrelated failure on whichever request first needs a
 * missing table or function, which tells the reader nothing.
 *
 * So the mismatch is named here, once, before any request is handled, and
 * /api/health answers 503 for as long as it lasts so a container healthcheck
 * or load balancer keeps traffic away without this process having to exit.
 *
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { deploymentStatus } = await import('./lib/deployment');
  const status = deploymentStatus();
  if (status.production) {
    for (const problem of status.problems) console.error(problem.message);
    if (status.previewIgnored) console.warn('Preview identities are disabled in production.');
  }
  if (process.env.PASSDOWN_SETUP_CODE_SHA256 && !status.setupCodeHash)
    console.error('PASSDOWN_SETUP_CODE_SHA256 is invalid; browser setup is unavailable.');
  const { reportSchemaState } = await import('./lib/schema-report');
  await reportSchemaState();
}
