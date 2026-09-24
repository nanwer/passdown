import type { DraftGuide } from '@guide/contracts';
export function mergePublicationState(draft: DraftGuide, current: DraftGuide): DraftGuide {
  return {
    ...draft,
    audience: current.audience,
    state: current.state,
    currentRelease: current.currentRelease,
    publishedVersion: current.publishedVersion,
    publicationRevision: current.publicationRevision,
  };
}
