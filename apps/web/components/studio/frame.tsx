'use client';
import * as X from './studio-styles';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { BookOpen, ArrowLeft, LogOut, SlidersHorizontal } from 'lucide-react';
import { Button, SiteHeader, ThemeToggle, cn, iconButton, skipLink, headerLink } from '@guide/ui';
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
    <div className={X.studioRoot}>
      <a className={skipLink} href="#main">
        Skip to content
      </a>
      <SiteHeader
        brandHref="/"
        workspace={
          workspace
            ? { id: workspace.id, name: workspace.name, href: `/studio/${workspace.id}` }
            : undefined
        }
        navLabel="Studio navigation"
        sections={
          workspace
            ? [
                // Anyone in the workspace can see its guides. Only someone who
                // manages it gets the rest — gating the whole group on manage
                // left a viewer with no navigation at all. And these are the
                // workspace's sections, so they sit under it rather than beside
                // the installation's own links.
                { href: `/studio/${workspace.id}`, label: 'Guides' },
                // One entry rather than three. Guides and the library are what
                // you do daily; the tree, the catalog and the people are what
                // you set up occasionally, and a row of five made them look
                // like the same kind of thing.
                ...(workspace.role === 'manage'
                  ? [
                      {
                        href: `/studio/${workspace.id}/manage`,
                        label: 'Manage',
                        icon: <SlidersHorizontal size={15} />,
                      },
                    ]
                  : []),
                {
                  href: workspace.audience === 'private' ? `/w/${workspace.id}` : '/',
                  label: 'Library',
                  icon: <BookOpen size={15} />,
                },
              ]
            : []
        }
        utilities={
          <>
            <a className={headerLink} href="/studio">
              Workspaces
            </a>
            <ThemeToggle />
            {user && <span className={`text-[13px] text-muted max-[1000px]:hidden`}>{user}</span>}
            {onSignOut && (
              <button className={iconButton} onClick={onSignOut} aria-label="Sign out">
                <LogOut size={18} />
              </button>
            )}
          </>
        }
      />
      {children}
      <footer className={X.footer}>Local authoring · Manual saves</footer>
    </div>
  );
}
/**
 * Where a studio page sits: the workspace, then the section it belongs to.
 *
 * Every page used to write its own, and they disagreed — "Studio / Repair
 * collective" on the guides page, "Repair collective / People" on People, a
 * back arrow to Guides on pages reached from Manage. One rule now: each part
 * links to its page unless it is the page you are on.
 */
export function StudioTrail({
  workspace,
  section,
  current = false,
}: {
  workspace: Pick<StudioWorkspace, 'id' | 'name'>;
  section: 'Guides' | 'Manage';
  /** Whether the section is itself the page being shown. */
  current?: boolean;
}) {
  const sectionHref =
    section === 'Guides' ? `/studio/${workspace.id}` : `/studio/${workspace.id}/manage`;
  const workspaceIsCurrent = current && section === 'Guides';
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn(
        X.eyebrow,
        '[&_a]:text-inherit [&_a:hover]:text-ink [&_li+li]:before:me-1.5 [&_li+li]:before:content-["/"] [&_ol]:m-0 [&_ol]:flex [&_ol]:list-none [&_ol]:flex-wrap [&_ol]:gap-1.5 [&_ol]:p-0',
      )}
    >
      <ol>
        <li>
          {workspaceIsCurrent ? (
            <span>{workspace.name}</span>
          ) : (
            <a href={`/studio/${workspace.id}`}>{workspace.name}</a>
          )}
        </li>
        <li>
          {current ? (
            <span aria-current="page">{section}</span>
          ) : (
            <a href={sectionHref}>{section}</a>
          )}
        </li>
      </ol>
    </nav>
  );
}
export function ErrorNotice({ error }: { error: string }) {
  return (
    <div className={X.errorNotice} role="alert">
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
        <main className={X.container} id="main" tabIndex={-1}>
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
        <main className={X.container} id="main" tabIndex={-1}>
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
    <main className={X.narrowContainer} id="main" tabIndex={-1}>
      <div className={X.pageHeading}>
        <h1>Choose your own password.</h1>
        <p>
          This account was created with a password that was generated for it. Replace it before
          going any further — nothing else will work until you do.
        </p>
      </div>
      <form className={cn(X.card, X.form)} onSubmit={submit}>
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
        <p className={X.hint} id="new-password-hint">
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
