import { expect, it } from 'vitest';
import { sourceCodeURL } from './source';
it('links the exact revision or falls back to the public repository', () => {
  expect(sourceCodeURL({}, '83c70b2')).toBe('https://github.com/nanwer/passdown/tree/83c70b2');
  expect(sourceCodeURL({}, 'unknown')).toBe('https://github.com/nanwer/passdown');
  expect(sourceCodeURL({ PASSDOWN_SOURCE_URL: ' javascript:alert(1)' }, null)).toBe(
    'https://github.com/nanwer/passdown',
  );
  expect(sourceCodeURL({ PASSDOWN_SOURCE_URL: ' https://example.org/source ' }, null)).toBe(
    'https://example.org/source',
  );
});
