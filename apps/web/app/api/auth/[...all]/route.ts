import { createHash } from 'node:crypto';
import { ApplicationError } from '@guide/contracts';
import { getApplication } from '../../../../lib/application';
import { apiResponse, assertOrigin, readJSON } from '../../../../lib/http';
export const dynamic = 'force-dynamic';
const signInFailureLimit = 10;
const failureKey = (emailHash: string) => `sign-in-failures:${emailHash}`;
/**
 * Guessing spread thinly across many addresses never trips the per-address
 * limit, so one counter watches failures across the installation. It is set
 * far above any honest failure rate — people mistype — and well below what a
 * spraying attack needs to be worth running.
 */
const globalFailureLimit = 500;
const globalFailureKey = 'sign-in-failures:global';
type Context = { params: Promise<{ all: string[] }> };
/**
 * No identity endpoint answers GET. The library's get-session returns the
 * session token in its body, which would hand it to any script running in the
 * page; the application reads sessions on the server instead.
 */
export function GET() {
  return apiResponse({ route: '/api/auth/[...all]', method: 'GET' }, async () => {
    throw new ApplicationError('NOT_FOUND', 'Not found.', 404);
  });
}
/**
 * The session lives in an HttpOnly cookie so page scripts cannot read it. The
 * library also puts the token in the sign-in body; drop it and keep the rest,
 * including every Set-Cookie header.
 */
async function withoutSessionToken(response: Response) {
  // Read a copy: a response without a token is returned with its body unread.
  const body = await response
    .clone()
    .json()
    .catch(() => null);
  if (!body || typeof body !== 'object' || !('token' in body)) return response;
  delete body.token;
  const headers = new Headers();
  for (const [name, value] of response.headers)
    if (!['set-cookie', 'content-length'].includes(name)) headers.set(name, value);
  for (const cookie of response.headers.getSetCookie()) headers.append('set-cookie', cookie);
  return new Response(JSON.stringify(body), { status: response.status, headers });
}
export function POST(request: Request, context: Context) {
  return apiResponse({ route: '/api/auth/[...all]', method: 'POST' }, async () => {
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
      // A coarse flood guard for the whole installation. It counts failures
      // only, and only after an attempt is decided, for the same reason the
      // per-address limit does: a burst of correct sign-ins is a workday —
      // a shift starting, a class arriving — and refusing those would be this
      // application denying service to its own users on their busiest morning.
      // A burst of *failed* ones, spread across addresses so the per-address
      // limit never trips, is the thing a global counter is actually for.
      if (await getApplication().store.rateLimitReached(globalFailureKey, globalFailureLimit))
        throw new ApplicationError(
          'RATE_LIMITED',
          'Too many failed sign-in attempts right now. Please wait a minute and try again.',
          429,
        );
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
      if (emailHash) {
        await getApplication().store.consumeRateLimit(
          failureKey(emailHash),
          signInFailureLimit,
          60,
        );
        await getApplication().store.consumeRateLimit(globalFailureKey, globalFailureLimit, 60);
      }
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
    return withoutSessionToken(response);
  });
}
