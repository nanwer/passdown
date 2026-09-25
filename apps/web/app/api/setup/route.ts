import { ApplicationError, finishSetupSchema } from '@guide/contracts';
import { currentSession, enforceMutationLimits, getApplication } from '../../../lib/application';
import { apiResponse, assertOrigin, parseInput, readJSON } from '../../../lib/http';
export const dynamic = 'force-dynamic';

/**
 * Finish setting up: the signed-in default login becomes the first
 * administrator, with the person's own name, email address and password, and
 * the first workspace (migration 033).
 *
 * Like the password route, it reads the session directly: requireSession
 * refuses the default login everywhere, and this is the one thing it may do.
 * The database decides who counts as the default login, so a finished or any
 * other account is refused there, not here. This browser stays signed in;
 * every other session of the account ends.
 */
export function POST(request: Request) {
  return apiResponse({ route: '/api/setup', method: 'POST' }, async () => {
    const app = getApplication();
    assertOrigin(request, app.origin);
    const session = await currentSession(request.headers);
    if (!session) throw new ApplicationError('UNAUTHENTICATED', 'Sign in to continue.', 401);
    await enforceMutationLimits(session.user.id);
    const input = parseInput(finishSetupSchema, await readJSON(request, 16 * 1024));
    try {
      const result = await app.store.finishSetup(
        { kind: 'user', id: session.user.id, active: true },
        { ...input, keepSessionId: session.session.id },
      );
      return Response.json({ workspace: result.workspace }, { status: 201 });
    } catch (error) {
      if (error instanceof ApplicationError && error.status === 404)
        throw new ApplicationError(
          'SETUP_FINISHED',
          'Passdown is already set up. Sign in with your own email address.',
          404,
        );
      throw error;
    }
  });
}
