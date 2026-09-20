import { createHash } from 'node:crypto';
import { ApplicationError } from '@guide/contracts';
import { getApplication, enforceRateLimit } from '../../../../lib/application';
import { apiResponse, assertOrigin, readJSON } from '../../../../lib/http';
export const dynamic = 'force-dynamic';
const signInFailureLimit = 10;
const failureKey = (emailHash: string) => `sign-in-failures:${emailHash}`;
type Context = { params: Promise<{ all: string[] }> };
export function GET(request: Request, context: Context) {
  return apiResponse(async () => {
    if ((await context.params).all.join('/') !== 'get-session')
      throw new ApplicationError('NOT_FOUND', 'Not found.', 404);
    return getApplication().identity.handler(request);
  });
}
export function POST(request: Request, context: Context) {
  return apiResponse(async () => {
    const path = (await context.params).all.join('/');
    let emailHash = '';
    if (!['sign-in/email', 'sign-out'].includes(path))
      throw new ApplicationError('NOT_FOUND', 'Not found.', 404);
    const { identity, origin } = getApplication();
    assertOrigin(request, origin);
    const body = await readJSON(request, 16 * 1024);
    if (path === 'sign-in/email') {
      if (
        !body ||
        typeof body !== 'object' ||
        !('email' in body) ||
        !('password' in body) ||
        typeof body.email !== 'string' ||
        typeof body.password !== 'string' ||
        Object.keys(body).some((key) => !['email', 'password'].includes(key))
      )
        throw new ApplicationError('VALIDATION_ERROR', 'Enter your email and password.', 422);
      // A coarse flood guard across every attempt, successful or not.
      await enforceRateLimit('sign-in:global', 60);
      // The per-address limit exists to bound credential guessing, so it counts
      // failures. Charging a correct sign-in against it locks out anyone who
      // legitimately signs in often — several devices, a shared address, an
      // automated check — without making guessing any harder.
      emailHash = createHash('sha256').update(body.email.trim().toLowerCase()).digest('hex');
      if (await getApplication().store.rateLimitReached(failureKey(emailHash), signInFailureLimit))
        throw new ApplicationError(
          'RATE_LIMITED',
          'Too many failed sign-in attempts. Please wait a minute and try again.',
          429,
        );
    }
    const response = await identity.handler(
      new Request(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(body),
      }),
    );
    if (!response.ok) {
      // Only a failed attempt advances the guessing counter.
      if (emailHash)
        await getApplication().store.consumeRateLimit(
          failureKey(emailHash),
          signInFailureLimit,
          60,
        );
      const result = await response.json().catch(() => null);
      throw new ApplicationError(
        result?.code ?? 'AUTHENTICATION_FAILED',
        response.status >= 500
          ? 'Sign in is temporarily unavailable. Please try again.'
          : (result?.message ?? 'Unable to sign in with these details.'),
        response.status,
      );
    }
    // A correct password clears the counter, so one mistyped attempt cannot
    // linger and count against a later sign-in.
    if (emailHash) await getApplication().store.clearRateLimit(failureKey(emailHash));
    return response;
  });
}
