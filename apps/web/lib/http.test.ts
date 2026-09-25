import { afterEach, describe, expect, it, vi } from 'vitest';
import { assertOrigin, readJSON, apiResponse } from './http';
const origin = 'http://127.0.0.1:3100';
const route = { route: '/api/studio/[workspace]/guides', method: 'POST' };
const request = (body: string, extra: Record<string, string> = {}) =>
  new Request(origin + '/api/studio', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json', Origin: origin, ...extra },
  });
describe('mutation transport boundary', () => {
  it('requires exact origin and rejects cross-site requests', () => {
    expect(() => assertOrigin(request('{}'), origin)).not.toThrow();
    for (const headers of [
      { Origin: 'http://evil.test' },
      { Origin: 'null' },
      { Origin: '' },
      { 'Sec-Fetch-Site': 'cross-site' },
    ] as Record<string, string>[])
      expect(() => assertOrigin(request('{}', headers), origin)).toThrow(/origin/i);
  });
  it('uses the configured origin despite internal URLs or forged proxy headers', () => {
    const internal = new Request('http://localhost:3100/api/studio', {
      method: 'POST',
      headers: { Origin: origin },
    });
    expect(() => assertOrigin(internal, origin)).not.toThrow();
    const forged = request('{}', {
      Origin: 'https://evil.test',
      Host: 'evil.test',
      'X-Forwarded-Host': 'evil.test',
    });
    expect(() => assertOrigin(forged, origin)).toThrow(/origin/i);
  });
  it('bounds actual bytes even when Content-Length is missing or dishonest', async () => {
    await expect(readJSON(request('"abcdefgh"'), 5)).rejects.toMatchObject({ status: 413 });
    await expect(
      readJSON(request('"abcdefgh"', { 'Content-Length': '1' }), 5),
    ).rejects.toMatchObject({ status: 413 });
  });
  it('rejects malformed JSON and non-JSON without accepting arbitrary request data', async () => {
    await expect(readJSON(request('{'))).rejects.toMatchObject({ status: 400 });
    await expect(readJSON(request('{}', { 'Content-Type': 'text/plain' }))).rejects.toMatchObject({
      status: 415,
    });
    await expect(readJSON(request('{"title":"A"}'))).resolves.toEqual({ title: 'A' });
  });
  it('returns safe stable error envelopes and no-store request identifiers', async () => {
    const response = await apiResponse(route, async () => {
      throw new Error('password=secret');
    });
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const data = await response.json();
    expect(data.error.requestId).toBe(response.headers.get('x-request-id'));
    expect(JSON.stringify(data)).not.toContain('secret');
  });
});

describe('deliberate errors survive the bundler boundary', () => {
  it('keeps the status and code of an error that is not instanceof our class', async () => {
    // The bundler can produce a second copy of the contracts module, so an
    // error thrown from another copy fails instanceof while being the same
    // class. Before this was handled, a save conflict reached the author as
    // "the service is unavailable, please try again".
    const fromOtherCopy = Object.assign(new Error('This guide changed. Reload it before saving.'), {
      name: 'ApplicationError',
      code: 'CONFLICT',
      status: 409,
    });
    const response = await apiResponse(route, async () => {
      throw fromOtherCopy;
    });
    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.error.code).toBe('CONFLICT');
    expect(body.error.message).toBe('This guide changed. Reload it before saving.');
  });

  it('still reports an unexpected failure as unavailable', async () => {
    const response = await apiResponse(route, async () => {
      throw new Error('connection reset');
    });
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('does not mistake a plain object for one of our errors', async () => {
    const response = await apiResponse(route, async () => {
      throw { name: 'ApplicationError', status: 'nonsense', code: 'CONFLICT' };
    });
    expect(response.status).toBe(503);
  });
});

describe('operator diagnostics', () => {
  afterEach(() => vi.restoreAllMocks());
  const lines = () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    return () => spy.mock.calls.map((call) => JSON.parse(String(call[0])));
  };
  it('logs one line with the request ID people see for an unexpected failure', async () => {
    const logged = lines();
    const response = await apiResponse(route, async () => {
      throw Object.assign(new Error('relation "app.missing" does not exist'), { code: '42P01' });
    });
    const requestId = (await response.json()).error.requestId;
    const entries = logged();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      level: 'error',
      event: 'request.failed',
      requestId,
      method: 'POST',
      route: '/api/studio/[workspace]/guides',
      status: 503,
      error: { name: 'Error', code: '42P01', message: 'relation "app.missing" does not exist' },
    });
    expect(Date.parse(entries[0].time)).not.toBeNaN();
  });
  it('never logs connection strings, tokens, hashes or email addresses from an error', async () => {
    const logged = lines();
    const token = 'A'.repeat(43);
    const hash = 'f'.repeat(64);
    await apiResponse(route, async () => {
      throw new Error(
        `failed for postgresql://guide_owner:pw@db:5432/guide_app ${token} ${hash} owner@example.org`,
      );
    });
    const text = JSON.stringify(logged());
    for (const secret of ['postgresql://', 'pw@db', token, hash, 'owner@example.org'])
      expect(text).not.toContain(secret);
  });
  it('warns once for a deliberate server-side refusal and stays silent for client errors', async () => {
    const logged = lines();
    await apiResponse(route, async () => {
      throw Object.assign(new Error('Setup did not finish.'), {
        name: 'ApplicationError',
        code: 'SETUP_FAILED',
        status: 503,
      });
    });
    await apiResponse(route, async () => {
      throw Object.assign(new Error('Not found'), {
        name: 'ApplicationError',
        code: 'NOT_FOUND',
        status: 404,
      });
    });
    const entries = logged();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ level: 'warn', code: 'SETUP_FAILED', status: 503 });
  });
});
