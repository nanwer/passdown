'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  Globe2,
  Layers3,
  Moon,
  Sun,
  LockKeyhole,
} from 'lucide-react';
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
  active?: 'library' | 'components';
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
      <header className="site-header">
        <a className="brand" href="/" aria-label="Passdown home">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>
            Pass<span className="brand-light">down</span>
            <small>EARLY PREVIEW</small>
          </span>
        </a>
        <nav className="primary-nav" aria-label="Main navigation">
          <a
            className={active === 'library' ? 'active' : ''}
            href={libraryHref ?? (team ? '/preview/workshop' : '/')}
            aria-current={active === 'library' ? 'page' : undefined}
          >
            <BookOpen size={17} />
            {libraryLabel}
          </a>
          <a
            className={active === 'components' ? 'active' : ''}
            href="/components"
            aria-current={active === 'components' ? 'page' : undefined}
          >
            <Layers3 size={17} />
            Design workshop
          </a>
        </nav>
        <div className="header-actions">
          <ThemeToggle />
          {workspaceLabel ? <span>{workspaceLabel}</span> : <WorkspaceDisclosure team={team} />}
          {actions}
        </div>
      </header>
      {children}
      <footer className="site-footer">
        <a className="footer-brand" href="/">
          Made to be understood.
        </a>
        <span>{footerNote}</span>
        <a href="/components">
          Explore the design system <ArrowUpRight size={14} />
        </a>
      </footer>
    </div>
  );
}
