import { ApplicationError, setupSchema } from '@guide/contracts';
import { canonicalAccountEmail } from '@guide/database';
import { getApplication, enforceRateLimit } from '../../../lib/application';
import { deploymentStatus } from '../../../lib/deployment';
import { apiResponse, assertOrigin, parseInput, readJSON } from '../../../lib/http';
import { setupCodeMatches, setupRequired } from '../../../lib/setup';
export const dynamic = 'force-dynamic';
export function POST(request: Request) {
  return apiResponse({ route: '/api/setup', method: 'POST' }, async () => {
    const app = getApplication();
    assertOrigin(request, app.origin);
    if (!(await setupRequired()))
      throw new ApplicationError('NOT_FOUND', 'This installation is already set up.', 404);
    const input = parseInput(setupSchema, await readJSON(request, 16 * 1024));
    const hash = deploymentStatus().setupCodeHash;
    if (!hash)
      throw new ApplicationError(
        'SETUP_CODE_MISSING',
        'This installation has no setup code yet. Ask the operator to configure a setup code.',
        503,
      );
    if (!setupCodeMatches(input.code, hash)) {
      // Wrong guesses must never exhaust the operator's ability to use a valid code.
      // Per-client request-volume limits belong at the trusted reverse proxy.
      await enforceRateLimit('setup:failures', 30);
      throw new ApplicationError(
        'SETUP_CODE_INVALID',
        "That setup code isn't right. Check the code printed by the settings step, or ask the operator for a new one.",
        403,
      );
    }
    const email = canonicalAccountEmail(input.email);
    const { code: _code, ...account } = input;
    const outcome = await app.store.completeSetup({ ...account, email });
    if (outcome.outcome === 'already-set-up')
      throw new ApplicationError('NOT_FOUND', 'This installation is already set up.', 404);
    const failed = () =>
      new ApplicationError(
        'SETUP_FAILED',
        "Setup didn't finish and nothing was created. Try again.",
        503,
      );
    if (outcome.outcome === 'workspace-exists')
      throw new ApplicationError(
        'SETUP_WORKSPACE_EXISTS',
        'This database contains a workspace but no accounts. Restore a complete backup or use a new empty database. Existing data has not been changed.',
        503,
      );
    if (outcome.outcome === 'rolled-back') throw failed();
    if (outcome.outcome === 'uncertain') {
      let state;
      try {
        state = await app.store.reconcileSetup(email);
      } catch {
        throw new ApplicationError(
          'SETUP_OUTCOME_UNKNOWN',
          'Setup may have finished. Reload this page. If setup is no longer available, sign in with the email and password you chose; otherwise try again.',
          503,
        );
      }
      if (state === 'empty') throw failed();
      if (state === 'other-account')
        throw new ApplicationError('NOT_FOUND', 'This installation is already set up.', 404);
      return Response.json({ signIn: 'manual' }, { status: 201 });
    }
    try {
      const signedIn = await app.identity.api.signInEmail({
        body: { email, password: input.password },
        headers: request.headers,
        asResponse: true,
      });
      if (!signedIn.ok) return Response.json({ signIn: 'manual' }, { status: 201 });
      const response = Response.json({ workspace: outcome.workspace }, { status: 201 });
      for (const cookie of signedIn.headers.getSetCookie())
        response.headers.append('Set-Cookie', cookie);
      return response;
    } catch {
      return Response.json({ signIn: 'manual' }, { status: 201 });
    }
  });
}
