'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { BookOpen, ArrowLeft, LogOut, PenLine, FolderTree, Wrench } from 'lucide-react';
import { Button, ThemeToggle } from '@guide/ui';
import type { StudioSession, StudioWorkspace } from '@guide/contracts';
import { StudioError, studioFetch } from './transport';
import './studio.css';
export function Frame({
  children,
  workspace,
  user,
  onSignOut,
}: {
  children: ReactNode;
  workspace?: StudioWorkspace;
  user?: string;
  onSignOut?: () => void;
}) {
  return (
    <div className="studio">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="studio-header">
        <a className="studio-brand" href="/studio">
          <PenLine size={22} /> Passdown<span>studio</span>
        </a>
        <nav aria-label="Studio navigation">
          <a href="/studio">Workspaces</a>
          {workspace?.role === 'owner' && (
            <>
              <a href={`/studio/${workspace.id}`}>Guides</a>
              <a href={`/studio/${workspace.id}/categories`}>
                <FolderTree size={17} /> Categories
              </a>
              <a href={`/studio/${workspace.id}/catalog`}>
                <Wrench size={17} /> Catalog
              </a>
            </>
          )}
          <a href={workspace?.audience === 'private' ? `/w/${workspace.id}` : '/'}>
            <BookOpen size={17} /> Library
          </a>
        </nav>
        <div className="studio-header-actions">
          <ThemeToggle />
          {user && <span className="studio-user">{user}</span>}
          {onSignOut && (
            <button className="icon-button" onClick={onSignOut} aria-label="Sign out">
              <LogOut size={18} />
            </button>
          )}
        </div>
      </header>
      {children}
      <footer className="studio-footer">Local authoring · Manual saves</footer>
    </div>
  );
}
export function ErrorNotice({ error }: { error: string }) {
  return (
    <div className="studio-notice studio-notice--error" role="alert">
      {error}
    </div>
  );
}
export function SessionGate({
  workspaceId,
  children,
}: {
  workspaceId?: string;
  children: (session: StudioSession, workspace: StudioWorkspace | undefined) => ReactNode;
}) {
  const [session, setSession] = useState<StudioSession>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    studioFetch<StudioSession>('/api/studio/session')
      .then((result) => {
        if (active) setSession(result);
      })
      .catch((e: unknown) => {
        if (!active) return;
        if (e instanceof StudioError && e.status === 401) {
          window.location.replace(
            `/sign-in?returnTo=${encodeURIComponent(window.location.pathname)}`,
          );
          return;
        }
        setError(e instanceof Error ? e.message : 'Unable to load your session.');
      });
    return () => {
      active = false;
    };
  }, [attempt]);
  const workspace = session?.workspaces.find((item) => item.id === workspaceId);
  async function signOut() {
    if (!window.confirm('Sign out? Save your work before continuing.')) return;
    try {
      await studioFetch('/api/auth/sign-out', { method: 'POST', body: '{}' });
      window.location.assign('/sign-in');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign out failed.');
    }
  }
  return (
    <Frame
      workspace={workspace}
      user={session?.user.name}
      onSignOut={session ? () => void signOut() : undefined}
    >
      {!session ? (
        <main className="studio-container" id="main" tabIndex={-1}>
          {error ? (
            <>
              <ErrorNotice error={error} />
              <Button
                onClick={() => {
                  setError('');
                  setAttempt(attempt + 1);
                }}
              >
                Try again
              </Button>
              <p>Local account details are provided by the operator in LOCAL_ACCESS.md.</p>
            </>
          ) : (
            <p role="status">Loading your workspace…</p>
          )}
        </main>
      ) : workspaceId && !workspace ? (
        <main className="studio-container" id="main" tabIndex={-1}>
          <h1>Workspace unavailable</h1>
          <p>You do not have access to this workspace.</p>
          <a href="/studio">
            <ArrowLeft size={16} /> Choose a workspace
          </a>
        </main>
      ) : (
        <>
          {error && <ErrorNotice error={error} />} {children(session, workspace)}
        </>
      )}
    </Frame>
  );
}
