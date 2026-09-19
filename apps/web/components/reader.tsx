import { AppShell } from '@guide/ui';
import { GuideArtwork, StepRenderer, PreparationList } from '@guide/guide-ui';
import type { DemoGuide } from '@guide/testing';
import type { GuideFamily } from '@guide/contracts';
import type { PublishedGuide } from '@guide/contracts';
import Link from 'next/link';
import { ArrowLeft, ArrowUp, Clock3, ListOrdered, LockKeyhole } from 'lucide-react';
export function Reader({
  guide,
  team = false,
  persistent = false,
  basePath,
  workspaceName,
  family,
}: {
  guide: DemoGuide | PublishedGuide;
  team?: boolean;
  persistent?: boolean;
  basePath?: string;
  workspaceName?: string;
  /**
   * Where this guide sits among broader and narrower versions of the same
   * subject. Only relatives the reader may open are present.
   */
  family?: GuideFamily;
}) {
  // Sample guides ship their artwork inline and have no stored pictures, so
  // only a persisted guide gets a media source.
  const mediaSrc =
    persistent && 'workspaceId' in guide
      ? (assetId: string) => `/api/media/${guide.workspaceId}/${assetId}`
      : undefined;
  const base = basePath ?? (team ? '/preview/workshop' : '/');
  // Relatives live beside this guide: '/guides/:id' publicly, or under the
  // workspace path when reading a members-only section.
  const readerBase = basePath ? `${basePath}/guides` : team ? '/preview/workshop/guides' : '/guides';
  const sample = !('isSample' in guide) || guide.isSample;
  const synthetic = team && !persistent;
  return (
    <AppShell
      team={team}
      libraryHref={base}
      workspaceLabel={persistent ? (workspaceName ?? 'Repair collective') : undefined}
      footerNote={persistent ? 'Write, share, and keep useful knowledge close.' : undefined}
      actions={
        persistent ? (
          <Link className="button button--primary" href="/studio">
            Write a guide
          </Link>
        ) : undefined
      }
    >
      <main id="main" className="reader page-width" tabIndex={-1}>
        <a href={base} className="back-link">
          <ArrowLeft size={16} />
          {team ? 'Team procedures' : 'All guides'}
        </a>
        {synthetic && (
          <p className="reader-preview">
            <LockKeyhole size={14} />
            Synthetic team preview · Sample data
          </p>
        )}
        <header className="reader-header">
          {'categoryPath' in guide && guide.categoryPath.length > 0 ? (
            <nav className="eyebrow reader-category-breadcrumb" aria-label="Category path">
              {guide.categoryPath.map((category, index) => (
                <span key={category.id}>
                  {index > 0 && ' / '}
                  <Link href={`${base === '/' ? '' : base}/categories/${category.id}`}>
                    {category.name}
                  </Link>
                </span>
              ))}
            </nav>
          ) : (
            <div className="eyebrow">{guide.category} / VISUAL FIELD NOTES</div>
          )}
          {family && family.ancestors.length > 0 && (
            <nav className="guide-family-trail" aria-label="Broader guides">
              {family.ancestors.map((ancestor) => (
                <a key={ancestor.id} href={`${readerBase}/${ancestor.id}`}>
                  {ancestor.title}
                </a>
              ))}
            </nav>
          )}
          <h1>{guide.title}</h1>
          <p className="reader-summary">{guide.summary}</p>
          <div className="reader-metadata">
            <span>
              <Clock3 size={16} />
              {new Intl.NumberFormat('en', {
                style: 'unit',
                unit: 'minute',
                unitDisplay: 'long',
              }).format(guide.document.durationMinutes)}
            </span>
            <span>
              <ListOrdered size={16} />
              {guide.document.steps.length} steps
            </span>
            <span>
              <i className={`difficulty-dot difficulty-${guide.document.difficulty}`} />
              {guide.document.difficulty}
            </span>
            <span className="release-tag">
              {sample ? 'Sample' : 'Published'} · v{guide.release}
            </span>
          </div>
        </header>
        <div className="reader-layout">
          <aside className="reader-sidebar">
            <nav aria-label="Guide steps">
              <p className="eyebrow">IN THIS GUIDE</p>
              {guide.document.steps.map((step, index) => (
                <a key={step.id} href={`#step-${step.id}`}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  {step.title}
                </a>
              ))}
            </nav>
            <PreparationList document={guide.document} />
            <div className="reader-credit">
              <span className="avatar">{team ? 'WO' : 'RC'}</span>
              <div>
                <strong>{guide.author}</strong>
                <small>
                  {sample
                    ? 'Original sample content'
                    : 'license' in guide
                      ? guide.license === 'all-rights-reserved'
                        ? 'All rights reserved'
                        : guide.license
                      : ''}
                </small>
              </div>
            </div>
          </aside>
          <div className="reader-body">
            {family && family.children.length > 0 && (
              <section className="guide-family-children" aria-labelledby="family-children">
                <h2 id="family-children">Choose your version</h2>
                <p>
                  This guide covers the range. These cover a particular one in more detail.
                </p>
                <ul>
                  {family.children.map((child) => (
                    <li key={child.id}>
                      <a href={`${readerBase}/${child.id}`}>{child.title}</a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {guide.document.steps.map((step, index) => (
              <StepRenderer
                key={step.id}
                step={step}
                document={guide.document}
                index={index}
                mediaSrc={mediaSrc}
                illustration={
                  sample && (index === 0 || index === 2) ? (
                    <GuideArtwork kind={guide.artwork} detail />
                  ) : undefined
                }
              />
            ))}
            <div className="reader-end">
              <span>That’s the walkthrough.</span>
              <a className="text-link" href="#main">
                Back to the beginning
                <ArrowUp size={16} />
              </a>
            </div>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
