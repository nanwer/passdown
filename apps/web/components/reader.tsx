import { AppShell, buttonVariants } from '@guide/ui';
import { GuideArtwork, StepRenderer, PreparationList } from '@guide/guide-ui';
import { sampleArtwork, type DemoGuide } from '@guide/testing';
import type { GuideFamily } from '@guide/contracts';
import type { PublishedGuide } from '@guide/contracts';
import Link from 'next/link';
import { ArrowLeft, ArrowUp, Clock3, ListOrdered, LockKeyhole, PenLine } from 'lucide-react';
export function Reader({
  guide,
  team = false,
  persistent = false,
  basePath,
  workspaceName,
  editHref,
  family,
  signedIn = false,
}: {
  guide: DemoGuide | PublishedGuide;
  team?: boolean;
  persistent?: boolean;
  basePath?: string;
  workspaceName?: string;
  /**
   * Where this guide is edited, for someone who may edit it.
   *
   * A guide had two places: the one people read and a separate copy inside the
   * studio, which you could only reach by knowing it was there. Offering the
   * edit from the page you are already on is what every comparable product
   * does: the affordance belongs beside the thing it acts on.
   */
  editHref?: string;
  /**
   * Where this guide sits among broader and narrower versions of the same
   * subject. Only relatives the reader may open are present.
   */
  family?: GuideFamily;
  /** Whether there is a session. Decides what the header's one button offers. */
  signedIn?: boolean;
}) {
  // Sample guides ship their artwork inline and have no stored pictures, so
  // only a persisted guide gets a media source.
  const mediaSrc =
    persistent && 'workspaceId' in guide
      ? (assetId: string, width?: number) =>
          `/api/media/${guide.workspaceId}/${assetId}${width ? `?w=${width}` : ''}`
      : undefined;
  // The same name the library uses for itself. "Repair collective" was this
  // project's own seed leaking into every installation's header.
  const libraryName = workspaceName ?? (team ? 'Workshop operations' : 'Public guides');
  const base = basePath ?? (team ? '/preview/workshop' : '/');
  // Relatives live beside this guide: '/guides/:id' publicly, or under the
  // workspace path when reading a members-only section.
  const readerBase = basePath
    ? `${basePath}/guides`
    : team
      ? '/preview/workshop/guides'
      : '/guides';
  const sample = !('isSample' in guide) || guide.isSample;
  const drawing = 'artwork' in guide ? guide.artwork : sample ? sampleArtwork(guide.id) : undefined;
  const synthetic = team && !persistent;
  return (
    <AppShell
      team={team}
      libraryHref={base}
      workspaceLabel={persistent ? libraryName : undefined}
      footerNote={persistent ? 'Write, share, and keep useful knowledge close.' : undefined}
      actions={
        editHref ? (
          // Edit is the thing to do from here, so it takes the weight and the
          // studio link goes quiet. Two filled buttons side by side also pushed
          // the header past the viewport at phone width.
          <>
            <Link className={buttonVariants()} href={editHref}>
              <PenLine size={16} aria-hidden="true" /> Edit
            </Link>
            <Link className="site-header-link" href="/studio">
              Studio
            </Link>
          </>
        ) : !persistent ? undefined : signedIn ? (
          // Named for where it goes, not for one thing you can do there. As
          // "Write a guide" it was the only door from the public library into
          // the studio, so anyone looking for the catalog, things or people had
          // no reason to press it and no other way through.
          <Link className={buttonVariants()} href="/studio">
            <PenLine size={16} aria-hidden="true" /> Open studio
          </Link>
        ) : (
          // A visitor has no studio to open.
          <Link className={buttonVariants()} href="/sign-in">
            Sign in
          </Link>
        )
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
            <nav
              className="eyebrow reader-category-breadcrumb"
              aria-label="Where this guide is filed"
            >
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
                <p>This guide covers the range. These cover a particular one in more detail.</p>
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
                  drawing && (index === 0 || index === 2) ? (
                    <GuideArtwork kind={drawing} detail />
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
