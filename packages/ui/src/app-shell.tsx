'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BookOpen, ChevronDown, Globe2, Moon, Sun, LockKeyhole } from 'lucide-react';
import { SiteHeader } from './site-header';
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.dataset.theme === 'dark');
  }, []);
  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    try {
      localStorage.setItem('guide-theme', next ? 'dark' : 'light');
    } catch {
      /* Theme still works when persistence is unavailable. */
    }
  }
  return (
    <button
      type="button"
      className="icon-button"
      onClick={toggle}
      aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
    >
      {dark ? <Sun size={19} /> : <Moon size={19} />}
    </button>
  );
}

function WorkspaceDisclosure({ team }: { team: boolean }) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const currentWorkspace = team ? 'Workshop operations' : 'Repair collective';

  useEffect(() => {
    function closeWhenFocusLeaves(event: FocusEvent) {
      const details = detailsRef.current;
      if (details?.open && !details.contains(event.target as Node)) details.open = false;
    }

    function closeFromOutsidePointer(event: PointerEvent) {
      const details = detailsRef.current;
      if (details?.open && !details.contains(event.target as Node)) details.open = false;
    }

    function closeFromEscape(event: KeyboardEvent) {
      const details = detailsRef.current;
      if (event.key !== 'Escape' || !details?.open) return;
      event.preventDefault();
      details.open = false;
      details.querySelector('summary')?.focus();
    }

    document.addEventListener('focusin', closeWhenFocusLeaves);
    document.addEventListener('pointerdown', closeFromOutsidePointer);
    document.addEventListener('keydown', closeFromEscape);
    return () => {
      document.removeEventListener('focusin', closeWhenFocusLeaves);
      document.removeEventListener('pointerdown', closeFromOutsidePointer);
      document.removeEventListener('keydown', closeFromEscape);
    };
  }, []);

  return (
    <details className="workspace-menu" ref={detailsRef}>
      <summary aria-label={`Current workspace: ${currentWorkspace}`}>
        {team ? <LockKeyhole size={16} /> : <Globe2 size={16} />}
        <span aria-hidden="true">{currentWorkspace}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </summary>
      <div className="workspace-options" role="group" aria-label="Choose workspace">
        <p>Explore a sample workspace</p>
        <a href="/" aria-current={team ? undefined : 'page'}>
          <Globe2 size={17} />
          <span>
            Repair collective<small>Public community</small>
          </span>
        </a>
        <a href="/preview/workshop" aria-current={team ? 'page' : undefined}>
          <LockKeyhole size={17} />
          <span>
            Workshop operations<small>Synthetic team preview</small>
          </span>
        </a>
      </div>
    </details>
  );
}

export function AppShell({
  children,
  active = 'library',
  team = false,
  actions,
  libraryHref,
  libraryLabel = 'Library',
  workspaceLabel,
  footerNote = 'Original sample guides · Read-only development preview',
}: {
  children: ReactNode;
  active?: 'library';
  team?: boolean;
  actions?: ReactNode;
  libraryHref?: string;
  libraryLabel?: string;
  workspaceLabel?: string;
  footerNote?: string;
}) {
  return (
    <div className="app-shell">
      <a
        className="skip-link"
        href="#main"
        onClick={(event) => {
          const main = document.getElementById('main');
          if (!main) return;
          event.preventDefault();
          main.focus({ preventScroll: true });
          main.scrollIntoView({ block: 'start' });
          window.history.replaceState(window.history.state, '', '#main');
        }}
      >
        Skip to content
      </a>
      {/* The same header the studio renders. Its top tier is the installation
          and its second tier belongs to whatever you are inside — here, one
          library. The shape does not change between the two surfaces; only the
          utilities on the right do. */}
      <SiteHeader
        workspace={
          workspaceLabel ? { id: '', name: workspaceLabel, href: libraryHref ?? '/' } : undefined
        }
        sections={[
          {
            href: libraryHref ?? (team ? '/preview/workshop' : '/'),
            label: libraryLabel,
            icon: <BookOpen size={15} />,
            current: active === 'library',
          },
        ]}
        utilities={
          <>
            <ThemeToggle />
            {!workspaceLabel && <WorkspaceDisclosure team={team} />}
            {actions}
          </>
        }
      />
      {children}
      <footer className="site-footer">
        <a className="footer-brand" href="/">
          Made to be understood.
        </a>
        <span>{footerNote}</span>
      </footer>
    </div>
  );
}
