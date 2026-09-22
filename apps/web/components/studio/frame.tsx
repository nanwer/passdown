'use client';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { BookOpen, ArrowLeft, LogOut, PenLine, FolderTree, Users, Wrench } from 'lucide-react';
import { words } from '../../lib/vocabulary';
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
          {workspace?.role === 'manage' && (
            <>
              <a href={`/studio/${workspace.id}`}>Guides</a>
              <a href={`/studio/${workspace.id}/categories`}>
                <FolderTree size={17} /> {words.Things}
              </a>
              <a href={`/studio/${workspace.id}/catalog`}>
                <Wrench size={17} /> Catalog
              </a>
              <a href={`/studio/${workspace.id}/people`}>
                <Users size={17} /> People
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
  const [mustChangePassword, setMustChangePassword] = useState(false);
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
        // The account exists and is signed in; it simply cannot do anything
        // until the password it was given has been replaced. Every studio
        // route refuses it, so there is nowhere else to send them.
        if (e instanceof StudioError && e.code === 'PASSWORD_CHANGE_REQUIRED') {
          setMustChangePassword(true);
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
      {mustChangePassword ? (
        <ChangePassword
          onChanged={() => {
            setMustChangePassword(false);
            setAttempt(attempt + 1);
          }}
        />
      ) : !session ? (
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

/**
 * The only thing an account may do before its first password is replaced.
 *
 * Shown in place of the studio rather than at its own address: every route
 * refuses this account, so a redirect would only be a longer way of arriving
 * here. The fields are ordinary password inputs — the person types their own
 * secret, which is the one place a password belongs.
 */
function ChangePassword({ onChanged }: { onChanged: () => void }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const fields = new FormData(event.currentTarget);
    const newPassword = String(fields.get('newPassword') ?? '');
    if (newPassword !== String(fields.get('confirmPassword') ?? '')) {
      setError('Those two do not match.');
      return;
    }
    setPending(true);
    setError('');
    try {
      await studioFetch('/api/studio/password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: String(fields.get('currentPassword') ?? ''),
          newPassword,
        }),
      });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to change the password.');
      setPending(false);
    }
  }

  return (
    <main className="studio-container studio-narrow" id="main" tabIndex={-1}>
      <div className="studio-page-heading">
        <h1>Choose your own password.</h1>
        <p>
          This account was created with a password that was generated for it. Replace it before
          going any further — nothing else will work until you do.
        </p>
      </div>
      <form className="studio-card studio-form" onSubmit={submit}>
        {error && <ErrorNotice error={error} />}
        <label>
          Current password
          <input
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
            maxLength={200}
          />
        </label>
        <label>
          New password
          <input
            name="newPassword"
            type="password"
            autoComplete="new-password"
            aria-describedby="new-password-hint"
            required
            minLength={12}
            maxLength={200}
          />
        </label>
        {/* Described rather than labelled: inside the label this text becomes
            part of the field's name, so it is read out as "New password at
            least twelve characters" every time the field is announced. */}
        <p className="studio-hint" id="new-password-hint">
          At least twelve characters.
        </p>
        <label>
          New password again
          <input
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={200}
          />
        </label>
        <Button type="submit" loading={pending}>
          Change password
        </Button>
      </form>
    </main>
  );
}
