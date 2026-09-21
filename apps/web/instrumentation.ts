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
 * The first administrator is created here too, for the opposite reason: it has
 * to happen before anything is served. A setup page that waits for the first
 * visitor is a race for administrator rights that anyone who can reach the
 * port may win.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { reportSchemaState } = await import('./lib/schema-report');
  await reportSchemaState();
  const { bootstrapIfEmpty } = await import('./lib/first-run');
  await bootstrapIfEmpty();
}
