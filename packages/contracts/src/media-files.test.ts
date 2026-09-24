import { describe, expect, it } from 'vitest';
import { mediaFileName, parseDisplayMediaFileName, MediaFileNameError } from './media-files';
const asset = '12345678-1234-4234-8234-123456789abc';
describe('canonical media names', () => {
  it('shares display and allowed rendition names without filesystem dependencies', () => {
    expect(mediaFileName('workshop', asset)).toBe(`workshop/${asset}.display.webp`);
    for (const width of [400, 800, 1600] as const)
      expect(mediaFileName('workshop', asset, `w${width}`)).toBe(
        `workshop/${asset}.w${width}.webp`,
      );
    expect(parseDisplayMediaFileName(`workshop/${asset}.display.webp`)).toEqual({
      workspace: 'workshop',
      asset,
    });
    expect(parseDisplayMediaFileName(`workshop/${asset}.w400.webp`)).toBeNull();
  });
  it.each(['../outside', '/outside', 'a/b', 'a\\b', 'workshop\n', '', '.', 'A', 'a'.repeat(101)])(
    'refuses unsafe workspace %j',
    (workspace) => {
      expect(() => mediaFileName(workspace, asset)).toThrow(MediaFileNameError);
      expect(parseDisplayMediaFileName(`${workspace}/${asset}.display.webp`)).toBeNull();
    },
  );
  it.each(['-'.repeat(36), '../outside', asset.toUpperCase(), `${asset}\n`, '1234'])(
    'refuses malformed asset %j',
    (id) => {
      expect(() => mediaFileName('workshop', id)).toThrow(MediaFileNameError);
      expect(parseDisplayMediaFileName(`workshop/${id}.display.webp`)).toBeNull();
    },
  );
  it.each(['w200', '../outside', 'display.webp', 'display\n'])(
    'refuses unsupported variant %j',
    (variant) => {
      expect(() => mediaFileName('workshop', asset, variant as 'display')).toThrow(
        MediaFileNameError,
      );
    },
  );
});
