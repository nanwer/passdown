import Link from 'next/link';
import { words } from '../lib/vocabulary';
import { AppShell } from '@guide/ui';
import { GuideCard } from '@guide/guide-ui';
import type { DemoGuide } from '@guide/testing';
import {
  libraryPageSize,
  type PublishedGuide,
  type Category,
  type CategoryCounts,
} from '@guide/contracts';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  FolderTree,
  LockKeyhole,
  PenLine,
  Search,
} from 'lucide-react';
import { t } from '../lib/messages';
import { LibrarySearchField } from './library-search-field';
import { LibraryCategoryLink } from './library-category-link';
import './library-search.css';
import { CategoryBrowse, CategoryBreadcrumbs } from './category-browse';
export function Library({
  guides,
  categories,
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
  categories: string[];
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
  const link = (next: string) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (next) params.set('category', next);
    return `${base}${params.size ? '?' + params : ''}`;
  };
  // The category a chip has selected, when this library has a real taxonomy.
  // The chips filter the list in place; this is the same thing's own page,
  // which is where its picture, its description and anything inside it live.
  const chosen = selectedCategory ? undefined : taxonomy?.find((item) => item.id === category);
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
          <Link className="button button--primary" href="/studio">
            <PenLine size={16} aria-hidden="true" /> Open studio
          </Link>
        ) : (
          // A visitor has no studio to open. The same button used to say so to
          // everybody, because it asked whether the installation had a database
          // rather than whether anybody was signed in.
          <Link className="button button--primary" href="/sign-in">
            Sign in
          </Link>
        )
      }
    >
      <main id="main" tabIndex={-1}>
        {selectedCategory ? (
          <section className="category-hero page-width">
            <CategoryBreadcrumbs category={selectedCategory} base={guideBase} />
            {/* The picture had one home, the browse grid on the front page. That
                grid is gone, so it shows here instead — at the size it deserves,
                on the page about this one thing. */}
            {selectedCategory.imageAssetId && (
              <img
                className="category-hero-image"
                src={`/api/media/${selectedCategory.workspaceId}/${selectedCategory.imageAssetId}?w=400`}
                alt=""
                decoding="async"
              />
            )}
            {/* The library names itself in the header tab and again in the
                breadcrumb above. A third label here was only noise. */}
            <h1>{selectedCategory.name}</h1>
            <p>
              {selectedCategory.description ||
                'Find instructions, explore related topics and build on what others know.'}
            </p>
          </section>
        ) : (
          /* A library is a place you search, not a product being sold to
             someone already standing in it. The hero cost 613px and ended in a
             link reading "Find your next guide" with an arrow pointing down —
             an apology for the 1,293px between the header and the first guide. */
          <section className="library-search-band page-width">
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
          className="collection page-width"
          id="collection"
          aria-labelledby="collection-title"
        >
          {selectedCategory ? (
            <div className="collection-heading">
              <h2 id="collection-title">
                Guides in {selectedCategory.name}
                <span className="count">{total}</span>
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
            <div className="preview-banner">
              <LockKeyhole size={18} />
              <p>
                <strong>Synthetic team preview.</strong> This sample shows the private-workspace
                experience. It contains no real team data and does not sign you in.
              </p>
            </div>
          )}
          {selectedCategory ? (
            // Inside a category the category is the page, so the search narrows
            // what is already on it and belongs beside the results.
            <div className="library-toolbar library-toolbar--category">
              <LibrarySearchField
                query={query}
                category=""
                base={searchBase}
                label={t.searchLabel}
                placeholder={t.searchPlaceholder}
                buttonLabel={t.searchButton}
              />
            </div>
          ) : (
            <div className="library-filters">
              <nav className="category-tabs" aria-label={`Guide ${words.things}`}>
                <LibraryCategoryLink href={link('')} base={base} category="" current={!category}>
                  {t.allCategories}
                </LibraryCategoryLink>
                {(taxonomy
                  ? taxonomy
                      .filter((item) => item.parentId === null)
                      .map((item) => ({
                        value: item.id,
                        label: item.name,
                        // Recognition beats reading: a model number means
                        // nothing, a picture of the thing means everything.
                        image: item.imageAssetId
                          ? `/api/media/${item.workspaceId}/${item.imageAssetId}?w=400`
                          : null,
                      }))
                  : categories.map((item) => ({ value: item, label: item, image: null }))
                ).map((item) => (
                  <LibraryCategoryLink
                    key={item.value}
                    href={link(item.value)}
                    base={base}
                    category={item.value}
                    current={category === item.value || category === item.label}
                  >
                    {item.image && <img src={item.image} alt="" loading="lazy" decoding="async" />}
                    {item.label}
                  </LibraryCategoryLink>
                ))}
              </nav>
              <span className="library-count">
                {total} {total === 1 ? 'guide' : 'guides'}
              </span>
            </div>
          )}
          {chosen && (
            /* The browse grid was the only way into a category's own page, and
               it is gone. This appears only once you have picked a category, so
               the default page keeps its shape. */
            <Link
              className="library-chosen-category"
              href={`${guideBase}/categories/${chosen.id}`}
              // Without this the link announces as its own contents — the name,
              // then the description, then the word Open.
              aria-label={`Open ${chosen.name}`}
            >
              {chosen.imageAssetId ? (
                <img
                  src={`/api/media/${chosen.workspaceId}/${chosen.imageAssetId}?w=400`}
                  alt=""
                  decoding="async"
                />
              ) : (
                <span className="library-chosen-icon">
                  <FolderTree size={17} aria-hidden="true" />
                </span>
              )}
              <span className="library-chosen-copy">
                <strong>{chosen.name}</strong>
                {chosen.description && <span>{chosen.description}</span>}
              </span>
              <span className="library-chosen-go">
                Open <ArrowRight size={15} aria-hidden="true" />
              </span>
            </Link>
          )}
          <p className="sr-only" role="status">
            {total} {total === 1 ? 'guide' : 'guides'} found.
            {total > guides.length && ` Showing ${first} to ${last}.`}
          </p>
          <div className="guide-results">
            {guides.length ? (
              <div className="guide-grid">
                {guides.map((guide) => (
                  <GuideCard
                    key={guide.id}
                    title={guide.title}
                    summary={guide.summary}
                    category={guide.category}
                    minutes={guide.document.durationMinutes}
                    difficulty={guide.document.difficulty}
                    steps={guide.document.steps.length}
                    artwork={guide.artwork}
                    href={`${guideBase}/guides/${guide.id}`}
                  />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <Search size={32} />
                <h3>{selectedCategory && !query ? 'No published guides here yet' : t.noResults}</h3>
                <p>
                  {selectedCategory && !query
                    ? 'This category is ready for new knowledge. Its published guides and subcategory guides will appear here.'
                    : t.noResultsHelp}
                </p>
                <Link
                  className="button button--secondary"
                  href={query ? searchBase : base}
                  scroll={false}
                >
                  {query ? t.clearFilters : 'Browse all guides'}
                </Link>
              </div>
            )}
          </div>
          {total > guides.length && (
            <nav className="library-pager" aria-label="Library pages">
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
              <div className="library-pager-links">
                {currentPage > 1 && (
                  <Link className="button button--secondary" href={pageLink(currentPage - 1)}>
                    <ArrowLeft size={16} aria-hidden="true" />
                    Previous
                  </Link>
                )}
                {guides.length > 0 && currentPage < pageCount && (
                  <Link className="button button--secondary" href={pageLink(currentPage + 1)}>
                    Next
                    <ArrowRight size={16} aria-hidden="true" />
                  </Link>
                )}
              </div>
            </nav>
          )}
        </section>
        <section className="principle-strip page-width">
          <span className="strip-symbol" aria-hidden="true">
            ↗
          </span>
          <div>
            <h2>Knowledge is better when it’s shared.</h2>
            <p>For the person doing it for the first time. And the team doing it every day.</p>
          </div>
          <a href={team ? '/' : '/preview/workshop'} className="text-link">
            {team ? 'Explore the community' : 'See the team preview'}
            <ArrowUpRight size={17} />
          </a>
        </section>
      </main>
    </AppShell>
  );
}
