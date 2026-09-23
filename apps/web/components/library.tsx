import * as P from './public-styles';
import Link from 'next/link';
import { words } from '../lib/vocabulary';
import { AppShell, buttonVariants } from '@guide/ui';
import { GuideCard } from '@guide/guide-ui';
import { sampleArtwork, type DemoGuide } from '@guide/testing';
import {
  libraryPageSize,
  type PublishedGuide,
  type Category,
  type CategoryCounts,
} from '@guide/contracts';
import { ArrowLeft, ArrowRight, ArrowUpRight, LockKeyhole, PenLine, Search } from 'lucide-react';
import { t } from '../lib/messages';
import { LibrarySearchField } from './library-search-field';
import { LibraryCategoryLink } from './library-category-link';
import { CategoryBrowse, CategoryBreadcrumbs } from './category-browse';
export function Library({
  guides,
  query = '',
  category = '',
  team = false,
  persistent = false,
  basePath,
  workspaceName,
  taxonomy,
  selectedCategory,
  categoryCounts = [],
  total = guides.length,
  offset = 0,
  limit = libraryPageSize,
  libraries,
  signedIn = false,
}: {
  guides: (DemoGuide | PublishedGuide)[];
  query?: string;
  category?: string;
  team?: boolean;
  persistent?: boolean;
  basePath?: string;
  workspaceName?: string;
  taxonomy?: Category[];
  selectedCategory?: Category;
  categoryCounts?: CategoryCounts[];
  /**
   * How many guides matched, which is not how many are on this page. A listing
   * is bounded so its cost does not grow with the collection; saying what the
   * page is a page of is what keeps that bound honest rather than a silent
   * truncation.
   */
  total?: number;
  offset?: number;
  limit?: number;
  /**
   * The libraries this visitor can read, drawn as tabs in the header. A
   * members-only library is absent for anyone who cannot open it, so the tab
   * strip never advertises a door that would answer 404.
   */
  libraries?: { href: string; label: string; current: boolean }[];
  /** Whether there is a session. Decides what the header's one button offers. */
  signedIn?: boolean;
}) {
  // What this library is called. It was two literals — the names of this
  // project's own development seed — which is the same mistake as the root
  // workspace id being a literal: every other installation read as ours.
  const libraryName = workspaceName ?? (team ? 'Workshop operations' : 'Public guides');
  const base = basePath ?? (team ? '/preview/workshop' : '/');
  const guideBase = base === '/' ? '' : base;
  const synthetic = team && !persistent;
  const searchBase = selectedCategory ? `${guideBase}/categories/${selectedCategory.id}` : base;
  // A category has one address. It used to have two — this row filtered the
  // library through `?category=`, while the same category also had its own page
  // with its picture, its description and whatever sits inside it. Same guides,
  // different chrome, two URLs to bookmark and two to keep working.
  const link = (next: string) => {
    const search = query ? `?q=${encodeURIComponent(query)}` : '';
    return next ? `${guideBase}/categories/${next}${search}` : `${base}${search}`;
  };
  /** The drawing a sample guide ships instead of pictures. Nothing else has one. */
  const drawing = (guide: DemoGuide | PublishedGuide) =>
    'artwork' in guide ? guide.artwork : guide.isSample ? sampleArtwork(guide.id) : undefined;
  /**
   * A picture for a guide card: the cover somebody chose, or the guide's own
   * first picture, or the picture of the nearest thing it is filed under.
   *
   * Every card used to draw the same illustration, because the column that
   * decides which one has a default and no writer.
   */
  const cover = (guide: DemoGuide | PublishedGuide) => {
    if (!('workspaceId' in guide)) return undefined;
    // A cover somebody chose, first. The rest are guesses standing in for one.
    if ('coverAssetId' in guide && guide.coverAssetId)
      return {
        src: `/api/media/${guide.workspaceId}/${guide.coverAssetId}?w=800`,
        alt: `Cover picture for ${guide.title}`,
      };
    const own = guide.document.steps.flatMap((step) => step.media)[0];
    if (own) return { src: `/api/media/${guide.workspaceId}/${own.assetId}?w=800`, alt: own.alt };
    const path = 'categoryPath' in guide ? [...guide.categoryPath].reverse() : [];
    for (const step of path) {
      const found = taxonomy?.find((item) => item.id === step.id && item.imageAssetId);
      if (found)
        return {
          src: `/api/media/${found.workspaceId}/${found.imageAssetId}?w=800`,
          alt: `Illustration for ${found.name}`,
        };
    }
    return undefined;
  };
  const first = guides.length ? offset + 1 : 0;
  const last = offset + guides.length;
  const currentPage = Math.floor(offset / limit) + 1;
  const pageCount = Math.max(Math.ceil(total / limit), 1);
  const pageLink = (index: number) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (!selectedCategory && category) params.set('category', category);
    if (index > 1) params.set('page', String(index));
    // The results, not the hero: a reader asking for more guides should land on
    // them rather than at the top of a page they have already read.
    return `${searchBase}${params.size ? '?' + params : ''}#collection`;
  };
  return (
    <AppShell
      team={team}
      libraryHref={base}
      workspaceLabel={persistent ? libraryName : undefined}
      libraries={libraries}
      footerNote={persistent ? 'Write, share, and keep useful knowledge close.' : undefined}
      actions={
        !persistent ? undefined : signedIn ? (
          // Named for where it goes, not for one thing you can do there. As
          // "Write a guide" it was the only door from the public library into
          // the studio, so anyone looking for the catalog, things or people had
          // no reason to press it and no other way through.
          <Link className={buttonVariants()} href="/studio">
            <PenLine size={16} aria-hidden="true" /> Open studio
          </Link>
        ) : (
          // A visitor has no studio to open. The same button used to say so to
          // everybody, because it asked whether the installation had a database
          // rather than whether anybody was signed in.
          <Link className={buttonVariants()} href="/sign-in">
            Sign in
          </Link>
        )
      }
    >
      <main id="main" tabIndex={-1}>
        {selectedCategory ? (
          <section className={`${P.pageWidth} pt-10 pb-9`}>
            <CategoryBreadcrumbs category={selectedCategory} base={guideBase} />
            {/* The picture had one home, the browse grid on the front page. That
                grid is gone, so it shows here instead — at the size it deserves,
                on the page about this one thing. */}
            {selectedCategory.imageAssetId && (
              <img
                className="category-hero-image mt-5 mb-1 block aspect-video w-full max-w-[320px] rounded-panel border border-line object-cover"
                src={`/api/media/${selectedCategory.workspaceId}/${selectedCategory.imageAssetId}?w=400`}
                alt=""
                decoding="async"
              />
            )}
            {/* The library names itself in the header tab and again in the
                breadcrumb above. A third label here was only noise. */}
            <h1 className="max-w-[900px] text-[clamp(36px,5vw,64px)] leading-[1.12] tracking-[-0.055em] wrap-anywhere">
              {selectedCategory.name}
            </h1>
            <p className="mt-4 max-w-[720px] text-[18px] text-muted wrap-anywhere">
              {selectedCategory.description ||
                'Find instructions, explore related topics and build on what others know.'}
            </p>
          </section>
        ) : (
          /* A library is a place you search, not a product being sold to
             someone already standing in it. The hero cost 613px and ended in a
             link reading "Find your next guide" with an arrow pointing down —
             an apology for the 1,293px between the header and the first guide. */
          <section
            className={`${P.pageWidth} pt-11 pb-8 max-[470px]:pt-7.5 max-[470px]:pb-6 [&_.search-form]:w-[min(100%,680px)] [&_h1]:mt-0 [&_h1]:mb-2.5 [&_h1]:text-[clamp(30px,3.2vw,42px)] [&_h1]:leading-[1.12] [&_h1]:font-medium [&_h1]:tracking-[-1.6px] [&>p]:mb-5.5 [&>p]:max-w-[470px] [&>p]:text-[14px] [&>p]:leading-[1.7] [&>p]:text-muted`}
          >
            <h1>{team ? t.teamFindTitle : t.findTitle}</h1>
            <p>{team ? t.teamFindDescription : t.findDescription}</p>
            <LibrarySearchField
              query={query}
              category={category}
              base={searchBase}
              label={t.searchLabel}
              placeholder={t.searchPlaceholder}
              buttonLabel={t.searchButton}
            />
          </section>
        )}
        {taxonomy && selectedCategory && (
          <CategoryBrowse
            categories={taxonomy}
            parentId={selectedCategory?.id ?? null}
            base={guideBase}
            counts={categoryCounts}
          />
        )}
        <section
          className={`${P.pageWidth} scroll-mt-[28px] border-t border-solid border-t-line pt-[37px] max-[760px]:pt-[29px] [&_h2:not(.sr-only)]:mt-1.5 [&_h2]:flex [&_h2]:items-center [&_h2]:gap-[13px] [&_h2]:text-[29px] [&_h2]:font-medium [&_h2]:tracking-[-1px] max-[760px]:[&_h2]:text-[26px]`}
          id="collection"
          aria-labelledby="collection-title"
        >
          {selectedCategory ? (
            <div className="mb-[27px] flex items-end justify-between gap-5 max-[760px]:mb-5.5">
              <h2 id="collection-title">
                Guides in {selectedCategory.name}
                <span className="inline-flex rounded-[5px] border border-solid border-line px-2 py-[7px] font-mono text-[11px] leading-[1] tracking-[0] text-muted">
                  {total}
                </span>
              </h2>
            </div>
          ) : (
            // The page's one heading is the search band above. This names the
            // list for anyone navigating by headings without repeating it.
            <h2 id="collection-title" className="sr-only">
              {team ? 'Team guides' : 'Guides'}
            </h2>
          )}
          {synthetic && (
            <div className="preview-banner mb-5.5 flex items-center gap-3 rounded-control border border-solid border-info-line bg-info-surface px-4.5 py-[15px] text-[12px] text-info [&_svg]:shrink-0">
              <LockKeyhole size={18} />
              <p>
                <strong>Synthetic team preview.</strong> This sample shows the private-workspace
                experience. It contains no real team data and does not sign you in.
              </p>
            </div>
          )}
          {selectedCategory && (
            // Inside a category the category is the page, so the search narrows
            // what is already on it and belongs beside the results.
            <div className="mb-7 flex items-center justify-between gap-6">
              <LibrarySearchField
                query={query}
                category=""
                base={searchBase}
                label={t.searchLabel}
                placeholder={t.searchPlaceholder}
                buttonLabel={t.searchButton}
              />
            </div>
          )}
          <div className="mb-[25px] flex items-center justify-between gap-5 max-[470px]:flex-col max-[470px]:items-stretch max-[470px]:gap-1">
            {/* The chips need categories to exist; the count does not. It used
                to live inside them, so a library with no categories yet showed
                no total either. */}
            {taxonomy && taxonomy.some((item) => item.parentId === null && !item.archived) && (
              <nav
                className="category-tabs mx-[-7px] my-0 flex min-w-0 flex-1 gap-2 overflow-x-auto px-[7px] py-2 [&_a]:inline-flex [&_a]:items-center [&_a]:gap-[7px] [&_a]:rounded-[6px] [&_a]:border [&_a]:border-solid [&_a]:border-transparent [&_a]:px-3.5 [&_a]:py-[7px] [&_a]:text-[11px] [&_a]:whitespace-nowrap [&_a]:text-muted [&_a[aria-current]]:bg-action [&_a[aria-current]]:font-semibold [&_a[aria-current]]:text-action-ink [&_a:hover:not([aria-current])]:border-line [&_img]:ms-[-5px] [&_img]:size-4.5 [&_img]:rounded-[4px] [&_img]:object-cover"
                aria-label={`Guide ${words.things}`}
              >
                <LibraryCategoryLink href={link('')} current={!category && !selectedCategory}>
                  {t.allCategories}
                </LibraryCategoryLink>
                {taxonomy
                  .filter((item) => item.parentId === null && !item.archived)
                  .map((item) => ({
                    value: item.id,
                    label: item.name,
                    // Recognition beats reading: a model number means nothing,
                    // a picture of the thing means everything.
                    image: item.imageAssetId
                      ? `/api/media/${item.workspaceId}/${item.imageAssetId}?w=400`
                      : null,
                  }))
                  .map((item) => (
                    <LibraryCategoryLink
                      key={item.value}
                      href={link(item.value)}
                      current={
                        (selectedCategory?.path[0]?.id ?? category) === item.value ||
                        category === item.label
                      }
                    >
                      {item.image && (
                        <img src={item.image} alt="" loading="lazy" decoding="async" />
                      )}
                      {item.label}
                    </LibraryCategoryLink>
                  ))}
              </nav>
            )}
            <span className="flex-none font-mono text-[11px] text-muted">
              {total} {total === 1 ? 'guide' : 'guides'}
            </span>
          </div>
          <p className="sr-only" role="status">
            {total} {total === 1 ? 'guide' : 'guides'} found.
            {total > guides.length && ` Showing ${first} to ${last}.`}
          </p>
          <div className="[min-block-size:max(24rem,calc(100svh_-_12rem))]">
            {guides.length ? (
              <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-x-6 gap-y-7.5 max-[1050px]:gap-5 max-[760px]:grid-cols-[repeat(2,minmax(0,1fr))] max-[470px]:grid-cols-[1fr] max-[470px]:gap-[23px]">
                {guides.map((guide) => (
                  <GuideCard
                    key={guide.id}
                    title={guide.title}
                    summary={guide.summary}
                    category={guide.category}
                    minutes={guide.document.durationMinutes}
                    difficulty={guide.document.difficulty}
                    steps={guide.document.steps.length}
                    artwork={drawing(guide)}
                    cover={cover(guide)}
                    href={`${guideBase}/guides/${guide.id}`}
                  />
                ))}
              </div>
            ) : (
              <div className="grid [justify-items:center] gap-[15px] rounded-panel border border-dashed border-control px-5 py-15 text-center [&_p]:text-muted">
                <Search size={32} />
                <h3>{selectedCategory && !query ? 'No published guides here yet' : t.noResults}</h3>
                <p>
                  {selectedCategory && !query
                    ? `Nothing has been published about this ${words.thing} yet. Guides filed here, or under anything inside it, will appear here.`
                    : t.noResultsHelp}
                </p>
                {/* Both filters, because the label says filters and because
                    somebody looking at nothing wants the way back to
                    everything — not to a category that is also nearly empty. */}
                <Link
                  className={buttonVariants({ variant: 'secondary' })}
                  href={base}
                  scroll={false}
                >
                  {query ? t.clearFilters : 'Browse all guides'}
                </Link>
              </div>
            )}
          </div>
          {total > guides.length && (
            <nav
              className="mt-6.5 flex flex-wrap items-center justify-between gap-4 border-t border-solid border-t-line pt-5 text-[12px] text-muted [&_strong]:text-ink"
              aria-label="Library pages"
            >
              <p>
                {guides.length ? (
                  <>
                    Showing <strong>{first}</strong>–<strong>{last}</strong> of{' '}
                    <strong>{total}</strong> guides
                  </>
                ) : (
                  <>
                    Page {currentPage} is past the end of {total} guides
                  </>
                )}
              </p>
              <div className="flex gap-2.5">
                {currentPage > 1 && (
                  <Link
                    className={buttonVariants({ variant: 'secondary' })}
                    href={pageLink(currentPage - 1)}
                  >
                    <ArrowLeft size={16} aria-hidden="true" />
                    Previous
                  </Link>
                )}
                {guides.length > 0 && currentPage < pageCount && (
                  <Link
                    className={buttonVariants({ variant: 'secondary' })}
                    href={pageLink(currentPage + 1)}
                  >
                    Next
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                )}
              </div>
            </nav>
          )}
        </section>
        <section
          className={`${P.pageWidth} mt-15 mb-[45px] flex items-center gap-5 [border-block:1px_solid_var(--gp-semantic-border-subtle)] py-7.5 max-[760px]:my-9.5 max-[760px]:flex-wrap max-[760px]:gap-4 [&_h2]:text-[17px] [&_h2]:font-medium [&_h2]:tracking-[-0.4px] max-[760px]:[&_h2]:text-[15px] [&_p]:mt-1 [&_p]:text-[11px] [&_p]:text-muted max-[760px]:[&>div]:min-w-[200px] max-[760px]:[&>div]:flex-1`}
        >
          <span className="text-[39px] leading-[1] font-normal text-action" aria-hidden="true">
            ↗
          </span>
          <div>
            <h2>Knowledge is better when it’s shared.</h2>
            <p>For the person doing it for the first time. And the team doing it every day.</p>
          </div>
          <a
            href={team ? '/' : '/preview/workshop'}
            className={`${P.textLink} ms-auto max-[760px]:ms-[37px]`}
          >
            {team ? 'Explore the community' : 'See the team preview'}
            <ArrowUpRight size={17} />
          </a>
        </section>
      </main>
    </AppShell>
  );
}
