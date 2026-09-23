import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from './cn';

export type HeaderSection = {
  href: string;
  label: string;
  icon?: ReactNode;
  current?: boolean;
};

/**
 * The one header, on every surface.
 *
 * It has two tiers and they are not peers. The top tier belongs to the
 * installation — the mark, which workspace you are in, and the utilities. The
 * second belongs to that workspace and is deliberately quieter.
 *
 * The order matters more than it looks. Both tiers used to be one flat row
 * mixing "Workspaces" and "Library", which belong to the installation, with
 * "Guides" and "Catalog", which belong to a workspace — and the row's contents
 * changed from page to page. Nielsen Norman's finding is that when local
 * navigation is as prominent as global, people miss the global one entirely;
 * Morville's is that a global bar carrying no location cue pushes the burden of
 * context downward and invites exactly this disorientation. Both were true here.
 *
 * So the skeleton never changes. Sections may be empty, utilities may be empty,
 * and the bar still renders the same shape in the same place.
 */
export function SiteHeader({
  brandHref = '/',
  workspace,
  sections = [],
  utilities,
  navLabel = 'Main navigation',
}: {
  brandHref?: string;
  /** Where you are. Absent on a surface that belongs to no workspace. */
  workspace?: { id: string; name: string; href?: string };
  /** This workspace's own sections — subordinate to everything above them. */
  sections?: HeaderSection[];
  /** Create, manage, account. The only part that varies with who is looking. */
  utilities?: ReactNode;
  navLabel?: string;
}) {
  return (
    <header className="border-b border-solid border-b-line bg-panel">
      <div className="site-header-top flex flex-wrap items-center gap-2.5 px-page py-3.5">
        <a
          className="inline-flex shrink-0 items-center gap-[11px] text-[20px] leading-[1.1] font-bold tracking-[-1px] max-[760px]:text-[19px]"
          href={brandHref}
          aria-label="Passdown home"
        >
          <span
            className="flex h-8 [transform:rotate(-13deg)] items-center gap-[3px] [&_i]:block [&_i]:h-[25px] [&_i]:w-[7px] [&_i]:rounded-[1px] [&_i]:bg-action [&_i:nth-child(2)]:h-[33px] [&_i:nth-child(3)]:h-5 forced-colors:[&_i]:[background:Highlight]"
            aria-hidden="true"
          >
            <i />
            <i />
            <i />
          </span>
          <span>
            Pass<span className="font-normal">down</span>
          </span>
        </a>
        {workspace && (
          <>
            <ChevronRight className="flex-none text-muted" size={16} aria-hidden="true" />
            <a
              className="min-w-0 overflow-hidden text-[14px] font-semibold text-ellipsis whitespace-nowrap text-ink"
              href={workspace.href ?? `/w/${workspace.id}`}
            >
              {workspace.name}
            </a>
          </>
        )}
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2.5">
          {utilities}
        </div>
      </div>
      {sections.length > 0 && (
        <nav
          className="flex flex-wrap gap-4.5 px-page pt-0 pb-2.5 text-[13px]"
          aria-label={navLabel}
        >
          {sections.map((section) => (
            <a
              key={section.href}
              href={section.href}
              className={cn(
                'inline-flex items-center gap-1.5 border-b-2 border-solid border-b-transparent pb-1 text-muted hover:text-ink',
                section.current && 'current border-b-action text-ink',
              )}
              aria-current={section.current ? 'page' : undefined}
            >
              {section.icon}
              {section.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
