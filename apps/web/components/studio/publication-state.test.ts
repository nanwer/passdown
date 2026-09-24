import { expect, it } from 'vitest';
import type { DraftGuide } from '@guide/contracts';
import { mergePublicationState } from './publication-state';
it('refreshes the authoritative audience without replacing unsaved draft content', () => {
  const document = { title: 'Unsaved private draft' };
  const draft = {
    audience: 'members',
    document,
    publicationRevision: 2,
    state: 'published',
  } as DraftGuide;
  const current = {
    audience: 'public',
    document: { title: 'Server draft' },
    publicationRevision: 3,
    state: 'published',
    currentRelease: 1,
    publishedVersion: 1,
  } as DraftGuide;
  const updated = mergePublicationState(draft, current);
  expect(updated.audience).toBe('public');
  expect(updated.document).toBe(document);
  expect(updated.publicationRevision).toBe(3);
});
