import { randomUUID } from 'node:crypto';
import { ApplicationError } from '@guide/contracts';

export function assertOrigin(request: Request, trustedOrigin: string) {
  // The target origin comes only from server configuration, never Host or proxy headers.
  // Next may rewrite request.url to an internal localhost address.
  if (
    request.headers.get('origin') !== trustedOrigin ||
    request.headers.get('sec-fetch-site') === 'cross-site'
  ) {
    throw new ApplicationError(
      'INVALID_ORIGIN',
      'This request came from an untrusted origin. Reload this page and try again.',
      403,
    );
  }
}

export async function readJSON(request: Request, limit = 1024 * 1024): Promise<unknown> {
  if (
    request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json'
  )
    throw new ApplicationError('UNSUPPORTED_MEDIA_TYPE', 'Send a JSON request.', 415);
  const tooLarge = () => new ApplicationError('BODY_TOO_LARGE', 'This request is too large.', 413);
  const declared = Number(request.headers.get('content-length'));
  if (declared > limit) throw tooLarge();
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) {
          await reader.cancel();
          throw tooLarge();
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApplicationError('INVALID_JSON', 'The request contains invalid JSON.', 400);
  }
}

/**
 * Whether this is one of our own errors, carrying a status and a code.
 *
 * `instanceof` alone is not enough: the bundler can produce more than one copy
 * of the contracts module, and an error thrown across that boundary fails the
 * check even though it is the same class. The consequence was silent and bad —
 * a save conflict degraded into "the service is unavailable, please try again",
 * which is both wrong and unactionable. Recognising the shape as well keeps a
 * deliberate error deliberate however it was bundled.
 */
function isApplicationError(error: unknown): error is ApplicationError {
  if (error instanceof ApplicationError) return true;
  const candidate = error as { name?: unknown; status?: unknown; code?: unknown } | null;
  return (
    !!candidate &&
    candidate.name === 'ApplicationError' &&
    typeof candidate.status === 'number' &&
    typeof candidate.code === 'string'
  );
}
export async function apiResponse(run: () => Promise<Response>): Promise<Response> {
  const requestId = randomUUID();
  let response: Response;
  try {
    response = await run();
  } catch (error) {
    const known = isApplicationError(error);
    const status = known ? error.status : 503;
    response = Response.json(
      {
        error: {
          code: known ? error.code : 'SERVICE_UNAVAILABLE',
          message: known
            ? error.message
            : 'The service is unavailable. Your unsaved changes are still here. Please try again.',
          requestId,
          ...(known && error.issues ? { issues: error.issues } : {}),
        },
      },
      { status, headers: status === 429 ? { 'Retry-After': '60' } : {} },
    );
  }
  response.headers.set('Cache-Control', 'private, no-store');
  response.headers.set('X-Request-ID', requestId);
  return response;
}

export function parseInput<T>(
  schema: {
    safeParse(
      input: unknown,
    ):
      | { success: true; data: T }
      | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
  },
  input: unknown,
): T {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new ApplicationError(
      'VALIDATION_ERROR',
      'Check the highlighted fields and try again.',
      422,
      result.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    );
  return result.data;
}

export function assertIdentifier(value: string) {
  if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(value))
    throw new ApplicationError('NOT_FOUND', 'Not found.', 404);
}
