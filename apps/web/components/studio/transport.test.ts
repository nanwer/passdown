import { afterEach, describe, expect, it, vi } from 'vitest';
import { StudioError, errorMessage, studioFetch, studioUpload } from './transport';

const requestId = '7f3a2c1b-9d4e-4f6a-8b1c-2d3e4f5a6b7c';

afterEach(() => vi.unstubAllGlobals());

function respond(status: number, body: unknown, headers: Record<string, string> = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      new Response(body === undefined ? 'Bad gateway' : JSON.stringify(body), {
        status,
        headers,
      }),
    ),
  );
}
async function failure(): Promise<StudioError> {
  try {
    await studioFetch('/api/studio/w/guides/g');
  } catch (error) {
    return error as StudioError;
  }
  throw new Error('The request did not fail.');
}

describe('studioFetch failures', () => {
  it('keeps the request ID and offers a short reference for an unexpected failure', async () => {
    respond(
      503,
      {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'The service is unavailable. Your unsaved changes are still here.',
          requestId,
        },
      },
      { 'X-Request-ID': requestId },
    );
    const error = await failure();
    expect(error).toBeInstanceOf(StudioError);
    expect(error.status).toBe(503);
    expect(error.requestId).toBe(requestId);
    expect(error.reference).toBe('7f3a2c1b');
    expect(errorMessage(error, 'fallback')).toEqual({
      message: 'The service is unavailable. Your unsaved changes are still here.',
      reference: '7f3a2c1b',
    });
  });

  it('reads the request ID from the header when the body has none', async () => {
    respond(500, undefined, { 'X-Request-ID': requestId });
    const error = await failure();
    expect(error.requestId).toBe(requestId);
    expect(error.reference).toBe('7f3a2c1b');
    expect(error.message).toBe('The request could not be completed. Try again.');
  });

  it('offers a reference for a known error on the server’s side', async () => {
    respond(503, {
      error: { code: 'BUSY', message: 'This account is busy. Try again shortly.', requestId },
    });
    expect((await failure()).reference).toBe('7f3a2c1b');
  });

  for (const [status, code, message] of [
    [422, 'VALIDATION_ERROR', 'Check the highlighted fields and try again.'],
    [409, 'CONFLICT', 'A newer draft exists.'],
    [403, 'FORBIDDEN', 'You cannot change this workspace.'],
    [429, 'RATE_LIMITED', 'Too many attempts.'],
  ] as const)
    it(`keeps the request ID but shows no reference for a ${status} the person can act on`, async () => {
      respond(status, { error: { code, message, requestId } }, { 'X-Request-ID': requestId });
      const error = await failure();
      expect(error.requestId).toBe(requestId);
      expect(error.reference).toBeUndefined();
      expect(errorMessage(error, 'fallback')).toBe(message);
    });

  it('shows no reference when no request ID reached the browser', async () => {
    respond(502, undefined);
    const error = await failure();
    expect(error.requestId).toBeUndefined();
    expect(error.reference).toBeUndefined();
    expect(errorMessage(error, 'fallback')).toBe('The request could not be completed. Try again.');
  });

  it('ignores a malformed request ID rather than showing it', async () => {
    respond(503, { error: { message: 'Unavailable.', requestId: '<b>x</b>' } });
    expect((await failure()).reference).toBeUndefined();
  });
});

describe('errorMessage', () => {
  it('uses the error’s own message, or the fallback for anything else', () => {
    expect(errorMessage(new Error('Plain failure.'), 'fallback')).toBe('Plain failure.');
    expect(errorMessage('not an error', 'Unable to save.')).toBe('Unable to save.');
    expect(errorMessage(new StudioError('', 503, 'X', requestId), 'Unable to save.')).toEqual({
      message: 'Unable to save.',
      reference: '7f3a2c1b',
    });
  });
});

describe('studioUpload failures', () => {
  class FakeRequest {
    static response: { status: number; body: string; headers: Record<string, string> };
    status = 0;
    responseText = '';
    withCredentials = false;
    upload = { addEventListener() {} };
    private listeners: Record<string, () => void> = {};
    open() {}
    addEventListener(type: string, listener: () => void) {
      this.listeners[type] = listener;
    }
    getResponseHeader(name: string) {
      return FakeRequest.response.headers[name.toLowerCase()] ?? null;
    }
    send() {
      this.status = FakeRequest.response.status;
      this.responseText = FakeRequest.response.body;
      queueMicrotask(() => this.listeners.load?.());
    }
    abort() {}
  }
  async function upload() {
    vi.stubGlobal('XMLHttpRequest', FakeRequest);
    try {
      await studioUpload('/api/studio/w/assets', new File(['x'], 'x.png'), () => {});
    } catch (error) {
      return error as StudioError;
    }
    throw new Error('The upload did not fail.');
  }

  it('keeps the request ID from the body and offers a reference for a server failure', async () => {
    FakeRequest.response = {
      status: 503,
      body: JSON.stringify({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Down.', requestId } }),
      headers: {},
    };
    const error = await upload();
    expect(error.requestId).toBe(requestId);
    expect(error.reference).toBe('7f3a2c1b');
  });

  it('falls back to the response header, and shows no reference for a refused file', async () => {
    FakeRequest.response = { status: 500, body: 'oops', headers: { 'x-request-id': requestId } };
    expect((await upload()).reference).toBe('7f3a2c1b');
    FakeRequest.response = {
      status: 422,
      body: JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Too big.', requestId } }),
      headers: {},
    };
    const refused = await upload();
    expect(refused.requestId).toBe(requestId);
    expect(refused.reference).toBeUndefined();
  });
});
