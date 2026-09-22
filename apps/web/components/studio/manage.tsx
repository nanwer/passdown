'use client';
import { FolderTree, Users, Wrench, ArrowRight } from 'lucide-react';
import { cardStyles, cn } from '@guide/ui';
import type { StudioWorkspace } from '@guide/contracts';
import { ErrorNotice, SessionGate } from './frame';
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
 * and three are what you set up occasionally. iFixit and Dozuki draw the line
 * in the same place: a guide is edited where you read it, and the structure
 * behind it lives in a console you go to deliberately.
 *
 * It is a page rather than a menu because a section with no landing page is a
 * named information-architecture mistake — and because a menu that has to be
 * opened to be read hides three destinations behind a hover.
 */
function ManageIndex({ workspace }: { workspace: StudioWorkspace }) {
  if (workspace.role !== 'manage')
    return (
      <main id="main" tabIndex={-1} className="studio-container studio-narrow">
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
    <main id="main" tabIndex={-1} className="studio-container studio-narrow">
      <div className="studio-page-heading">
        <a className="studio-eyebrow" href={`/studio/${workspace.id}`}>
          {workspace.name} / Manage
        </a>
        <h1>Set up this workspace.</h1>
        <p>
          What the guides here are about, what they call for, and who can reach them. Writing a
          guide happens under Guides; this is the structure behind it.
        </p>
      </div>
      <div className="manage-sections">
        {sections.map((section) => (
          <a key={section.href} href={section.href} className={cn(cardStyles, 'manage-section')}>
            <span className="manage-section-icon">{section.icon}</span>
            <span className="manage-section-body">
              <strong>{section.title}</strong>
              <span>{section.description}</span>
            </span>
            <ArrowRight size={18} className="manage-section-arrow" aria-hidden="true" />
          </a>
        ))}
      </div>
    </main>
  );
}
