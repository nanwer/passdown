import { describe, expect, it, vi } from 'vitest';
import config from '../next.config';
import { enforceMutationLimits } from './application';

vi.mock('server-only', () => ({}));

describe('request limits', () => {
  it("refuses a busy account without spending everyone else's allowance", async () => {
    const charged: string[] = [];
    const consume = async (key: string) => {
      charged.push(key);
      if (key === 'mutations:busy') throw new Error('limited');
    };
    await expect(enforceMutationLimits('busy', consume)).rejects.toThrow('limited');
    expect(charged).toEqual(['mutations:busy']);
    await enforceMutationLimits('quiet', consume);
    expect(charged).toEqual(['mutations:busy', 'mutations:quiet', 'mutations:global']);
  });
});

describe('framework image resizing', () => {
  it('is off, so pictures are only ever served by the authorised media route', () => {
    // /_next/image would fetch /api/media anonymously and cache the result
    // publicly for hours, outliving a withdrawal.
    expect(config.images?.unoptimized).toBe(true);
  });
});
