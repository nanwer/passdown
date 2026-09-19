import Link from 'next/link';
import { AppShell } from '@guide/ui';
import { GuideArtwork, GuideCard } from '@guide/guide-ui';
import type { DemoGuide } from '@guide/testing';
import type { PublishedGuide, Category } from '@guide/contracts';
import {
  ArrowDown,
  ArrowUpRight,
  BookOpen,
  Globe2,
  LockKeyhole,
  Search,
  SlidersHorizontal,
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
  categoryGuides = [],
  sections,
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
  categoryGuides?: Pick<PublishedGuide, 'categoryPath'>[];
  /**
   * Public and members-only views of one workspace. Omitted entirely for
   * visitors and signed-in nonmembers, so the internal section is not
   * advertised to anyone who cannot open it.
   */
  sections?: { active: 'public' | 'internal'; publicHref: string; internalHref: string };
}) {
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
      <main id="main" tabIndex={-1}>
        {selectedCategory ? (
          <section className="category-hero page-width">
            <CategoryBreadcrumbs category={selectedCategory} base={guideBase} />
            <div className="eyebrow">{team ? 'WORKSPACE KNOWLEDGE' : 'EXPLORE THE COLLECTIVE'}</div>
            <h1>{selectedCategory.name}</h1>
            <p>
              {selectedCategory.description ||
                'Find instructions, explore related topics and build on what others know.'}
            </p>
          </section>
        ) : (
          <section className="hero page-width">
            <div className="hero-copy">
              <div className="eyebrow">
                <span className="status-dot" />
                {team ? 'TEAM KNOWLEDGE, ALL TOGETHER' : 'A LITTLE KNOW-HOW GOES A LONG WAY'}
              </div>
              <h1>
                {team ? (
                  <>
                    Shared knowledge.
                    <br />
                    <em>Better work.</em>
                  </>
                ) : (
                  <>
                    Good knowledge.
                    <br />
                    <em>Put to work.</em>
                  </>
                )}
              </h1>
              <p>{team ? t.teamDescription : t.heroDescription}</p>
              <a href="#collection" className="text-link">
                {team ? 'Explore team procedures' : 'Find your next guide'}
                <ArrowDown size={18} />
              </a>
              <div className="hero-note">
                {team ? <LockKeyhole size={15} /> : <Globe2 size={15} />}
                <span>
                  {team
                    ? 'A shared foundation, a private workspace.'
                    : 'Built for communities. Useful to everyone.'}
                </span>
              </div>
            </div>
            <div className="hero-feature">
              <GuideArtwork kind={team ? 'bench' : 'bicycle'} detail />
              <div className="feature-caption">
                <div>
                  <span className="eyebrow">
                    {team ? 'WORKSPACE NOTES / 001' : 'EVERYDAY OBJECTS / 001'}
                  </span>
                  <strong>
                    {team ? 'A place for good work.' : 'Small details. A better ride.'}
                  </strong>
                </div>
                <a
                  href={`${guideBase}/guides/${team ? 'bench-handover' : 'bicycle-brake'}`}
                  className="round-link"
                  aria-label={team ? 'Read the workbench guide' : 'Read the bicycle guide'}
                >
                  <ArrowUpRight size={23} />
                </a>
              </div>
            </div>
          </section>
        )}
        {taxonomy && (
          <CategoryBrowse
            categories={taxonomy}
            parentId={selectedCategory?.id ?? null}
            base={guideBase}
            guides={categoryGuides}
          />
        )}
        <section
          className="collection page-width"
          id="collection"
          aria-labelledby="collection-title"
        >
          <div className="collection-heading">
            <div>
              <div className="eyebrow">
                {team ? 'WORKSHOP OPERATIONS' : 'THE REPAIR COLLECTIVE'}
              </div>
              <h2 id="collection-title">
                {selectedCategory
                  ? `Guides in ${selectedCategory.name}`
                  : team
                    ? 'Your team’s field guide'
                    : 'A place to start'}
                <span className="count">{guides.length}</span>
              </h2>
            </div>
            <span className="collection-note">
              <BookOpen size={16} />
              {synthetic
                ? 'Synthetic team preview'
                : team
                  ? 'Your published team procedures'
                  : 'A growing library of everyday know-how'}
            </span>
          </div>
          {synthetic && (
            <div className="preview-banner">
              <LockKeyhole size={18} />
              <p>
                <strong>Synthetic team preview.</strong> This sample shows the private-workspace
                experience. It contains no real team data and does not sign you in.
              </p>
            </div>
          )}
          {sections && (
            <nav className="section-switch" aria-label="Workspace sections">
              <a
                href={sections.publicHref}
                aria-current={sections.active === 'public' ? 'page' : undefined}
              >
                <Globe2 size={15} />
                Public
              </a>
              <a
                href={sections.internalHref}
                aria-current={sections.active === 'internal' ? 'page' : undefined}
              >
                <LockKeyhole size={15} />
                Internal
              </a>
            </nav>
          )}
          <div
            className={
              selectedCategory ? 'library-toolbar library-toolbar--category' : 'library-toolbar'
            }
          >
            <LibrarySearchField
              query={query}
              category={selectedCategory ? '' : category}
              base={searchBase}
              label={t.searchLabel}
              placeholder={t.searchPlaceholder}
              buttonLabel={t.searchButton}
            />
            <div className="sort-label">
              <SlidersHorizontal size={16} />
              Curated collection
            </div>
          </div>
          {!selectedCategory && (
            <nav className="category-tabs" aria-label="Guide categories">
              <LibraryCategoryLink href={link('')} base={base} category="" current={!category}>
                {t.allCategories}
              </LibraryCategoryLink>
              {(taxonomy
                ? taxonomy
                    .filter((item) => item.parentId === null)
                    .map((item) => ({ value: item.id, label: item.name }))
                : categories.map((item) => ({ value: item, label: item }))
              ).map((item) => (
                <LibraryCategoryLink
                  key={item.value}
                  href={link(item.value)}
                  base={base}
                  category={item.value}
                  current={category === item.value || category === item.label}
                >
                  {item.label}
                </LibraryCategoryLink>
              ))}
            </nav>
          )}
          <p className="sr-only" role="status">
            {guides.length} {guides.length === 1 ? 'guide' : 'guides'} found.
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
