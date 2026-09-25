import type { Instrumentation } from 'next';

/**
 * Operator log lines: one JSON object per line on stderr.
 *
 * An operator traces a failure a person reports by the request ID they were
 * shown. Lines never carry request bodies, cookies, concrete URLs, guide
 * content, credentials or tokens, and error messages pass through `redact`.
 */
type Level = 'info' | 'warn' | 'error';

export function logEvent(level: Level, event: string, fields: Record<string, unknown> = {}) {
  console.error(JSON.stringify({ time: new Date().toISOString(), level, event, ...fields }));
}

const sensitive = [
  /postgres(?:ql)?:\/\/\S+/gi,
  // Session tokens, reset and invitation tokens, setup codes and their hashes.
  /[A-Za-z0-9_-]{43,}/g,
  /\b[a-f0-9]{64}\b/gi,
  /[^\s@<>()"'=]+@[^\s@<>()"']+\.[A-Za-z]{2,}/g,
];
export function redact(text: string) {
  return sensitive.reduce((result, pattern) => result.replace(pattern, '[redacted]'), text);
}

/** Enough to diagnose, never the detail a database error attaches with row values. */
export function describeError(error: unknown) {
  if (!(error instanceof Error))
    return { name: typeof error, message: 'A non-error value was thrown.' };
  const code = (error as { code?: unknown }).code;
  return {
    name: error.name,
    ...(typeof code === 'string' && code.length <= 32 && { code }),
    message: redact(error.message).slice(0, 500),
  };
}

type OnRequestError = Parameters<Instrumentation.onRequestError>;
/**
 * A page or server-action failure, for Next's `onRequestError`. People see the
 * digest on the error page; the concrete path and headers are never logged.
 */
export function logRenderError(
  error: OnRequestError[0],
  request: OnRequestError[1],
  context: OnRequestError[2],
) {
  const digest = (error as { digest?: unknown } | null)?.digest;
  logEvent('error', 'render.failed', {
    ...(typeof digest === 'string' && { digest }),
    route: context.routePath,
    routeType: context.routeType,
    method: request.method,
    error: describeError(error),
  });
}
