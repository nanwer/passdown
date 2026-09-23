'use client';
import * as X from './studio-styles';
import { FolderTree, Users, Wrench, ArrowRight } from 'lucide-react';
import { cardStyles, cn } from '@guide/ui';
import type { StudioWorkspace } from '@guide/contracts';
import { ErrorNotice, SessionGate, StudioTrail } from './frame';
import { words } from '../../lib/vocabulary';
import './studio.css';

export function Manage({ workspaceId }: { workspaceId: string }) {
  return (
    <SessionGate workspaceId={workspaceId}>
      {(_, workspace) => <ManageIndex workspace={workspace!} />}
    </SessionGate>
  );
}

/**
 * Everything structural about a workspace, in one place.
 *
 * The tree, the catalog and the people were peers of Guides in the navigation,
 * which made a row of five destinations where two of them are what you do daily
 * and three are what you set up occasionally. The line belongs between them: a
 * guide is edited where you read it, and the structure behind it lives in a
 * console you go to deliberately.
 *
 * It is a page rather than a menu because a section with no landing page is a
 * named information-architecture mistake — and because a menu that has to be
 * opened to be read hides three destinations behind a hover.
 */
function ManageIndex({ workspace }: { workspace: StudioWorkspace }) {
  if (workspace.role !== 'manage')
    return (
      <main id="main" tabIndex={-1} className={X.narrowContainer}>
        <ErrorNotice error="Only someone who manages this workspace can set it up." />
      </main>
    );

  const sections = [
    {
      href: `/studio/${workspace.id}/categories`,
      icon: <FolderTree size={20} />,
      title: words.Things,
      description: `The tree of ${words.things} your guides are about — a product range, a room, a production line. Each one can carry a picture.`,
    },
    {
      href: `/studio/${workspace.id}/catalog`,
      icon: <Wrench size={20} />,
      title: 'Catalog',
      description:
        'Every tool, material and part your guides call for, with specifications and identifiers. A guide says whether it keeps an item or uses it up.',
    },
    {
      href: `/studio/${workspace.id}/people`,
      icon: <Users size={20} />,
      title: 'People',
      description:
        'Who can reach this workspace, what they may do, and who has been invited but has not arrived yet.',
    },
  ];

  return (
    <main id="main" tabIndex={-1} className={X.narrowContainer}>
      <div className={X.pageHeading}>
        <StudioTrail workspace={workspace} section="Manage" current />
        <h1>Set up this workspace.</h1>
        <p>
          What the guides here are about, what they call for, and who can reach them. Writing a
          guide happens under Guides; this is the structure behind it.
        </p>
      </div>
      <div className="grid gap-3">
        {sections.map((section) => (
          <a
            key={section.href}
            href={section.href}
            className={cn(cardStyles, 'flex items-start gap-3.5 px-5 py-4.5 hover:border-focus')}
          >
            <span className="grid size-9.5 flex-none place-items-center rounded-[10px] bg-sunken text-muted">
              {section.icon}
            </span>
            <span className="grid min-w-0 gap-[3px] [&_span]:text-[13px] [&_span]:leading-[1.5] [&_span]:text-muted [&_strong]:text-[15px] [&_strong]:text-ink">
              <strong>{section.title}</strong>
              <span>{section.description}</span>
            </span>
            <ArrowRight
              size={18}
              className="ml-auto flex-none self-center text-muted"
              aria-hidden="true"
            />
          </a>
        ))}
      </div>
    </main>
  );
}

/**
 * The three things Manage holds, as tabs on each of them.
 *
 * Things and the catalog had tabs naming them "Categories" and "Tools &
 * materials" while Manage called them Things and Catalog, and People had no
 * tabs at all. One set of names, and every section reachable from the others.
 */
export function ManageTabs({
  workspace,
  active,
}: {
  workspace: Pick<StudioWorkspace, 'id'>;
  active: 'things' | 'catalog' | 'people';
}) {
  const tabs = [
    {
      key: 'things',
      href: `/studio/${workspace.id}/categories`,
      label: words.Things,
      icon: FolderTree,
    },
    { key: 'catalog', href: `/studio/${workspace.id}/catalog`, label: 'Catalog', icon: Wrench },
    { key: 'people', href: `/studio/${workspace.id}/people`, label: 'People', icon: Users },
  ] as const;
  return (
    <nav
      aria-label="Manage this workspace"
      className="mt-8 mb-6 flex flex-wrap gap-6 border-b border-[var(--gp-semantic-border-subtle)]"
    >
      {tabs.map(({ key, href, label, icon: Icon }) => (
        <a
          key={key}
          href={href}
          aria-current={active === key ? 'page' : undefined}
          className={cn(
            'inline-flex items-center gap-2 border-b-2 border-transparent pb-[15px] text-sm text-[var(--gp-semantic-text-secondary)] no-underline',
            'hover:text-[var(--gp-semantic-text-primary)]',
            'aria-[current=page]:border-[var(--gp-semantic-focus-ring)] aria-[current=page]:font-bold aria-[current=page]:text-[var(--gp-semantic-text-primary)]',
          )}
        >
          <Icon size={17} aria-hidden="true" />
          {label}
        </a>
      ))}
    </nav>
  );
}
