import { describe, expect, it } from 'vitest';
import { assertOrigin, readJSON, apiResponse } from './http';
const origin = 'http://127.0.0.1:3100';
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
    const response = await apiResponse(async () => {
      throw new Error('password=secret');
    });
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toContain('no-store');
    const data = await response.json();
    expect(data.error.requestId).toBe(response.headers.get('x-request-id'));
    expect(JSON.stringify(data)).not.toContain('secret');
  });
});
