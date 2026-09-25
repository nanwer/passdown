import { ApplicationError, changePasswordSchema } from '@guide/contracts';
import { currentSession, enforceRateLimit, getApplication } from '../../../../lib/application';
import { apiResponse, assertOrigin, parseInput, readJSON } from '../../../../lib/http';
export const dynamic = 'force-dynamic';

/**
 * Replace your own password.
 *
 * Deliberately does not go through requireSession: that gate refuses everyone
 * who still has to change their password, which is exactly the person this
 * route exists for. It reads the session directly instead, so the one thing a
 * blocked account may do is stop being blocked.
 *
 * Twelve characters rather than Better Auth's default of eight. An operator
 * replacing a generated password has no reason to pick something shorter than
 * what they were given.
 */
export function POST(request: Request) {
  return apiResponse({ route: '/api/studio/password', method: 'POST' }, async () => {
    const app = getApplication();
    assertOrigin(request, app.origin);
    const session = await currentSession(request.headers);
    if (!session) throw new ApplicationError('UNAUTHENTICATED', 'Sign in to continue.', 401);
    // Guessing the current password is the attack this rate limit is for.
    await enforceRateLimit(`password:${session.user.id}`, 10);
    const input = parseInput(changePasswordSchema, await readJSON(request));
    if (input.currentPassword === input.newPassword)
      throw new ApplicationError(
        'VALIDATION_ERROR',
        'The new password must be different from the current one.',
        422,
      );
    try {
      await app.identity.api.changePassword({
        body: {
          currentPassword: input.currentPassword,
          newPassword: input.newPassword,
          revokeOtherSessions: true,
        },
        headers: request.headers,
      });
    } catch {
      // Better Auth distinguishes a wrong password from other failures, but
      // saying which is a free oracle for anyone testing a stolen session.
      throw new ApplicationError('VALIDATION_ERROR', 'That current password is not right.', 422);
    }
    await app.store.clearPasswordChangeRequirement(session.user.id);
    return Response.json({ changed: true });
  });
}
