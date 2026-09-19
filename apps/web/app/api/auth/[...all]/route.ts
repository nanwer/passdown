import { createHash } from 'node:crypto';
import { ApplicationError } from '@guide/contracts';
import { getApplication, enforceRateLimit } from '../../../../lib/application';
import { apiResponse, assertOrigin, readJSON } from '../../../../lib/http';
export const dynamic = 'force-dynamic';
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
      await enforceRateLimit('sign-in:global', 60);
      const emailHash = createHash('sha256').update(body.email.trim().toLowerCase()).digest('hex');
      await enforceRateLimit(`sign-in:${emailHash}`, 10);
    }
    const response = await identity.handler(
      new Request(request.url, {
        method: 'POST',
        headers: request.headers,
        body: JSON.stringify(body),
      }),
    );
    if (!response.ok) {
      const result = await response.json().catch(() => null);
      throw new ApplicationError(
        result?.code ?? 'AUTHENTICATION_FAILED',
        response.status >= 500
          ? 'Sign in is temporarily unavailable. Please try again.'
          : (result?.message ?? 'Unable to sign in with these details.'),
        response.status,
      );
    }
    return response;
  });
}
