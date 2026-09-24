import { ApplicationError, redeemPasswordResetSchema } from '@guide/contracts';
import { hashCredentialPassword } from '@guide/database';
import { currentSession, enforceRateLimit, getApplication } from '../../../../lib/application';
import { apiResponse, assertOrigin, parseInput, readJSON } from '../../../../lib/http';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ token: string }> };
const invalid = () => new ApplicationError('NOT_FOUND', 'This reset link is no longer valid.', 404);
function valid(token: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw invalid();
}
export function GET(request: Request, context: Context) {
  return apiResponse(async () => {
    await enforceRateLimit('password-reset:lookup', 120);
    const { token } = await context.params;
    valid(token);
    const preview = await getApplication().store.describePasswordReset(token);
    if (!preview) throw invalid();
    const session = await currentSession(request.headers);
    return Response.json({
      email: preview.email,
      name: preview.name,
      expiresAt: preview.expiresAt,
      signedInAs: session && session.user.id !== preview.userId ? session.user.email : null,
    });
  });
}
export function POST(request: Request, context: Context) {
  return apiResponse(async () => {
    const app = getApplication();
    assertOrigin(request, app.origin);
    await enforceRateLimit('password-reset:redeem', 60);
    const { token } = await context.params;
    valid(token);
    const input = parseInput(redeemPasswordResetSchema, await readJSON(request, 16 * 1024));
    const preview = await app.store.describePasswordReset(token);
    if (!preview) throw invalid();
    const session = await currentSession(request.headers);
    if (session && session.user.id !== preview.userId)
      await app.identity.api.signOut({ headers: request.headers });
    const hash = await hashCredentialPassword(input.password);
    if (!(await app.store.redeemPasswordReset(token, hash))) throw invalid();
    try {
      const signedIn = await app.identity.api.signInEmail({
        body: { email: preview.email, password: input.password },
        headers: request.headers,
        asResponse: true,
      });
      const response = Response.json({ redirect: signedIn.ok ? '/studio' : '/sign-in' });
      for (const cookie of signedIn.headers.getSetCookie())
        response.headers.append('Set-Cookie', cookie);
      return response;
    } catch {
      return Response.json({ redirect: '/sign-in' });
    }
  });
}
