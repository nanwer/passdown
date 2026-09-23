'use client';
import { iconButton, skipLink } from './primitives';
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
      className={iconButton}
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
    <details className="workspace-menu relative text-[12px]" ref={detailsRef}>
      <summary
        className="flex min-h-10.5 list-none items-center gap-2 rounded-control border border-solid border-line bg-panel px-3 forced-colors:border-[CanvasText] max-[1050px]:[&_span]:hidden max-[470px]:px-2.5 [&::-webkit-details-marker]:hidden"
        aria-label={`Current workspace: ${currentWorkspace}`}
      >
        {team ? <LockKeyhole size={16} /> : <Globe2 size={16} />}
        <span aria-hidden="true">{currentWorkspace}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </summary>
      <div
        className="absolute end-0 top-[53px] max-h-[calc(100dvh_-_24px)] w-[min(280px,calc(100vw_-_24px))] overflow-y-auto rounded-panel border border-solid border-line bg-raised p-3.5 [box-shadow:0_12px_45px_color-mix(in_srgb,var(--gp-semantic-text-primary)_12%,transparent)] forced-colors:border-[CanvasText] max-[470px]:fixed max-[470px]:end-3 max-[470px]:top-17.5 max-[470px]:max-h-[calc(100dvh_-_82px)] [&_a]:flex [&_a]:items-center [&_a]:gap-[13px] [&_a]:rounded-[6px] [&_a]:px-2 [&_a]:py-3 [&_a]:font-semibold [&_a:hover]:bg-canvas [&_p]:px-2 [&_p]:pt-0 [&_p]:pb-2 [&_p]:text-[11px] [&_p]:text-muted [&_small]:block [&_small]:text-[11px] [&_small]:font-normal [&_small]:text-muted"
        role="group"
        aria-label="Choose workspace"
      >
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
  libraries = [],
  workspaceLabel,
  footerNote = 'Original sample guides · Read-only development preview',
}: {
  children: ReactNode;
  active?: 'library';
  team?: boolean;
  actions?: ReactNode;
  libraryHref?: string;
  libraryLabel?: string;
  /**
   * Every library this visitor can read. Drawn as the header's second tier,
   * which is already a tab strip — so the switch travels with the header
   * instead of being a control somewhere down the page.
   */
  libraries?: { href: string; label: string; current: boolean }[];
  workspaceLabel?: string;
  footerNote?: string;
}) {
  return (
    <div className="app-shell">
      <a
        className={skipLink}
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
        // The tabs name the library, so repeating it in the tier above would
        // say the same word twice at two different sizes.
        workspace={
          workspaceLabel && !libraries.length
            ? { id: '', name: workspaceLabel, href: libraryHref ?? '/' }
            : undefined
        }
        navLabel={libraries.length ? 'Libraries' : 'Main navigation'}
        sections={
          libraries.length
            ? libraries.map((library) => ({
                href: library.href,
                label: library.label,
                icon: library.href === '/' ? <Globe2 size={15} /> : <LockKeyhole size={15} />,
                current: library.current,
              }))
            : [
                {
                  href: libraryHref ?? (team ? '/preview/workshop' : '/'),
                  label: libraryLabel,
                  icon: <BookOpen size={15} />,
                  current: active === 'library',
                },
              ]
        }
        utilities={
          <>
            <ThemeToggle />
            {!workspaceLabel && !libraries.length && <WorkspaceDisclosure team={team} />}
            {actions}
          </>
        }
      />
      {children}
      <footer className="mx-auto flex w-[min(100%_-_2_*_var(--gp-semantic-space-page),1280px)] items-center justify-between gap-5 pt-0 pb-9 text-[10px] text-muted max-[760px]:flex-wrap max-[760px]:gap-3.5 max-[760px]:pb-[25px] max-[470px]:text-[9px] [&_a]:flex [&_a]:items-center [&_a]:gap-1.5 max-[760px]:[&>span]:w-full max-[760px]:[&>span]:[order:3] max-[470px]:[&_a:last-child]:ms-auto">
        <a className="text-[12px] font-semibold text-ink" href="/">
          Made to be understood.
        </a>
        <span>{footerNote}</span>
      </footer>
    </div>
  );
}
