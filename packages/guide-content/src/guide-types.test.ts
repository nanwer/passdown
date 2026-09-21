import { describe, expect, it } from 'vitest';
import {
  composeGuideTitle,
  defaultGuideTypes,
  enabledGuideTypes,
  guideTypeCatalogSchema,
  guideTypeSchema,
} from './guide-types';

describe('the shipped catalog', () => {
  it('is a valid catalog', () => {
    expect(() => guideTypeCatalogSchema.parse(defaultGuideTypes)).not.toThrow();
  });

  it('covers both audiences this platform serves', () => {
    const keys = defaultGuideTypes.map((t) => t.key);
    // A repair collective and a workshop have to find themselves in one list;
    // shipping two lists would mean asking what kind of company you are before
    // asking anything useful.
    expect(keys).toEqual(expect.arrayContaining(['repair', 'replacement', 'teardown']));
    expect(keys).toEqual(expect.arrayContaining(['inspection', 'maintenance']));
  });

  it('gives every type a template that composes to something readable', () => {
    for (const type of defaultGuideTypes) {
      const title = composeGuideTitle(type, { thing: 'Floor (wood)', subject: 'Board' });
      expect(title).not.toMatch(/%/);
      expect(title.trim()).toBe(title);
      expect(title).not.toMatch(/\s{2}/);
    }
  });
});

describe('a catalog that would not work', () => {
  it('rejects two types sharing a key, because the key is the referent', () => {
    const clash = [
      defaultGuideTypes[0],
      { ...defaultGuideTypes[1], key: defaultGuideTypes[0].key },
    ];
    expect(() => guideTypeCatalogSchema.parse(clash)).toThrow(/share a key/);
  });

  it('rejects a template that asks for an answer its type never requests', () => {
    const hole = [{ ...defaultGuideTypes[0], prompt: '', titleTemplate: '%thing %subject Repair' }];
    expect(() => guideTypeCatalogSchema.parse(hole)).toThrow(/hole in it/);
  });

  it('rejects a key that could not survive a URL', () => {
    for (const key of ['Replacement', 'part swap', 'réparation', '']) {
      expect(() => guideTypeSchema.parse({ ...defaultGuideTypes[0], key })).toThrow();
    }
  });
});

describe('composing a title', () => {
  const replacement = defaultGuideTypes.find((t) => t.key === 'replacement')!;
  const teardown = defaultGuideTypes.find((t) => t.key === 'teardown')!;

  it('fills both placeholders', () => {
    expect(composeGuideTitle(replacement, { thing: 'Floor (wood)', subject: 'Board' })).toBe(
      'Floor (wood) Board Replacement',
    );
  });

  it('collapses an unanswered prompt instead of refusing', () => {
    // The author is still typing. A title that assembles as they answer is the
    // point; an error message here would be the blank-box problem with extra
    // steps.
    expect(composeGuideTitle(replacement, { thing: 'Floor (wood)' })).toBe(
      'Floor (wood) Replacement',
    );
    expect(composeGuideTitle(replacement, { thing: 'Floor (wood)', subject: '   ' })).toBe(
      'Floor (wood) Replacement',
    );
  });

  it('leaves a template with no prompt alone', () => {
    expect(composeGuideTitle(teardown, { thing: 'Desk lamp', subject: 'ignored' })).toBe(
      'Desk lamp Teardown',
    );
  });

  it('does not leave the double space a collapsed placeholder would', () => {
    expect(composeGuideTitle({ titleTemplate: 'A %subject B' }, { thing: 'x' })).toBe('A B');
    expect(composeGuideTitle({ titleTemplate: 'How to %subject' }, { thing: 'x' })).toBe('How to');
  });
});

describe('what a workspace has switched on', () => {
  it('keeps catalog order rather than the order the keys were given in', () => {
    // Otherwise the picker reorders itself depending on how the row was stored,
    // and two workspaces with the same types disagree about the list.
    expect(enabledGuideTypes(defaultGuideTypes, ['teardown', 'repair']).map((t) => t.key)).toEqual([
      'repair',
      'teardown',
    ]);
  });

  it('ignores a key the catalog no longer has', () => {
    // An operator editing the catalog must not break every workspace that had
    // switched on something they removed.
    expect(enabledGuideTypes(defaultGuideTypes, ['repair', 'gone']).map((t) => t.key)).toEqual([
      'repair',
    ]);
  });

  it('returns nothing when nothing is enabled', () => {
    expect(enabledGuideTypes(defaultGuideTypes, [])).toEqual([]);
  });
});
