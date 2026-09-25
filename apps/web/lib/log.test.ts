import { afterEach, describe, expect, it, vi } from 'vitest';
import { logRenderError } from './log';

describe('page render errors', () => {
  afterEach(() => vi.restoreAllMocks());
  it('logs the route pattern and error reference, never the address or headers', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logRenderError(
      Object.assign(new Error('Cannot read properties of undefined'), { digest: '2154768390' }),
      {
        path: '/invite/abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ?next=/studio',
        method: 'GET',
        headers: { cookie: 'better-auth.session_token=secret-session' },
      },
      {
        routerKind: 'App Router',
        routePath: '/invite/[token]',
        routeType: 'render',
        revalidateReason: undefined,
      },
    );
    expect(spy).toHaveBeenCalledTimes(1);
    const line = String(spy.mock.calls[0]![0]);
    expect(JSON.parse(line)).toMatchObject({
      level: 'error',
      event: 'render.failed',
      digest: '2154768390',
      route: '/invite/[token]',
      routeType: 'render',
      method: 'GET',
      error: { name: 'Error', message: 'Cannot read properties of undefined' },
    });
    for (const leaked of ['abcdefghijklmnop', 'secret-session', 'next=/studio', 'cookie'])
      expect(line).not.toContain(leaked);
  });
});
