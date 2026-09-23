import * as P from './public-styles';
import { AppShell, buttonVariants, headerLink } from '@guide/ui';
import { GuideArtwork, StepRenderer, PreparationList, difficultyDot } from '@guide/guide-ui';
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
            <Link className={headerLink} href="/studio">
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
      <main id="main" className={`${P.pageWidth} pt-8 pb-18`} tabIndex={-1}>
        <a href={base} className="inline-flex items-center gap-[9px] text-[12px] text-muted">
          <ArrowLeft size={16} />
          {team ? 'Team procedures' : 'All guides'}
        </a>
        {synthetic && (
          <p className="mt-5 flex items-center gap-2 text-[12px]">
            <LockKeyhole size={14} />
            Synthetic team preview · Sample data
          </p>
        )}
        <header className="border-b border-solid border-b-line py-9 max-[760px]:py-7 [&_h1]:mt-3.5 [&_h1]:mb-5 [&_h1]:max-w-[850px] [&_h1]:text-[clamp(32px,4vw,53px)] [&_h1]:leading-[1.18] [&_h1]:font-medium [&_h1]:tracking-[-1.8px] max-[760px]:[&_h1]:text-[37px]">
          {'categoryPath' in guide && guide.categoryPath.length > 0 ? (
            <nav className={P.eyebrow} aria-label="Where this guide is filed">
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
            <div className={P.eyebrow}>{guide.category} / VISUAL FIELD NOTES</div>
          )}
          {family && family.ancestors.length > 0 && (
            <nav
              className='mb-2.5 flex flex-wrap items-center gap-2 text-[13px] text-muted [&_a]:border-b [&_a]:border-solid [&_a]:border-b-line [&_a]:text-inherit [&_a]:no-underline [&_a:hover]:text-ink [&_a+a]:before:mr-2 [&_a+a]:before:[border:0] [&_a+a]:before:text-muted [&_a+a]:before:content-["/"]'
              aria-label="Broader guides"
            >
              {family.ancestors.map((ancestor) => (
                <a key={ancestor.id} href={`${readerBase}/${ancestor.id}`}>
                  {ancestor.title}
                </a>
              ))}
            </nav>
          )}
          <h1>{guide.title}</h1>
          <p className="max-w-[700px] text-[16px] leading-[1.8] text-muted">{guide.summary}</p>
          <div className="mt-7 flex flex-wrap items-center gap-[25px] text-[12px] text-muted max-[760px]:gap-[15px] max-[760px]:text-[11px] [&_span]:flex [&_span]:items-center [&_span]:gap-2">
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
              <i className={difficultyDot(guide.document.difficulty)} />
              {guide.document.difficulty}
            </span>
            <span className="ms-auto rounded-[5px] border border-solid border-line px-2.5 py-[5px] text-[10px] max-[760px]:ms-0">
              {sample ? 'Sample' : 'Published'} · v{guide.release}
            </span>
          </div>
        </header>
        <div className="grid grid-cols-[235px_minmax(0,1fr)] gap-13.5 pt-9 max-[1050px]:grid-cols-[200px_minmax(0,1fr)] max-[1050px]:gap-7 max-[760px]:grid-cols-[1fr] max-[760px]:gap-[25px]">
          <aside className="sticky top-7.5 [align-self:start] max-[760px]:static">
            <nav
              className="grid gap-[7px] max-[760px]:rounded-panel max-[760px]:border max-[760px]:border-solid max-[760px]:border-line max-[760px]:bg-panel max-[760px]:p-5 [&_a]:flex [&_a]:items-baseline [&_a]:gap-3 [&_a]:rounded-[5px] [&_a]:px-1.5 [&_a]:py-[9px] [&_a]:text-[12px] [&_a:hover]:bg-sunken [&_a_span]:font-mono [&_a_span]:text-[10px] [&_a_span]:text-muted"
              aria-label="Guide steps"
            >
              <p className={`${P.eyebrow} mb-4`}>IN THIS GUIDE</p>
              {guide.document.steps.map((step, index) => (
                <a key={step.id} href={`#step-${step.id}`}>
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  {step.title}
                </a>
              ))}
            </nav>
            <PreparationList document={guide.document} />
            <div className="flex items-center gap-2.5 py-6 text-[10px] max-[760px]:hidden [&_small]:block [&_small]:text-[10px] [&_small]:text-muted">
              <span className="grid size-9 place-items-center rounded-[50%] bg-success-surface font-semibold text-success">
                {team ? 'WO' : 'RC'}
              </span>
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
          <div className="min-w-0">
            {family && family.children.length > 0 && (
              <section
                className="mx-0 mt-0 mb-7 rounded-[12px] border border-solid border-line bg-sunken px-5 py-4.5 [&_a]:block [&_a]:rounded-[9px] [&_a]:border [&_a]:border-solid [&_a]:border-line [&_a]:bg-raised [&_a]:px-[13px] [&_a]:py-[11px] [&_a]:font-semibold [&_a]:text-ink [&_a]:no-underline [&_h2]:mx-0 [&_h2]:mt-0 [&_h2]:mb-1.5 [&_h2]:text-[17px] [&_p]:mx-0 [&_p]:mt-0 [&_p]:mb-3 [&_p]:text-[14px] [&_p]:text-muted [&_ul]:m-0 [&_ul]:grid [&_ul]:list-none [&_ul]:gap-2 [&_ul]:p-0"
                aria-labelledby="family-children"
              >
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
            <div className="flex items-center justify-between gap-4 text-[16px] font-medium max-[760px]:flex-wrap">
              <span>That’s the walkthrough.</span>
              <a className={P.textLink} href="#main">
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
