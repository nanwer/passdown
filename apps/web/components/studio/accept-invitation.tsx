'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@guide/ui';
import { Frame, ErrorNotice } from './frame';
import { studioFetch } from './transport';
import './studio.css';

type Invitation = { workspaceName: string; email: string; role: 'manage' | 'view' };

/**
 * Accepting an invitation.
 *
 * Outside the studio's session gate on purpose: the person here has no account
 * yet, so anything that asks who they are would send them to sign in, which is
 * the one thing they cannot do.
 */
export function AcceptInvitation({ token }: { token: string }) {
  const [invitation, setInvitation] = useState<Invitation | null>();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let live = true;
    studioFetch<Invitation>(`/api/invitations/${encodeURIComponent(token)}`)
      .then((result) => live && setInvitation(result))
      .catch(() => live && setInvitation(null));
    return () => {
      live = false;
    };
  }, [token]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const fields = new FormData(event.currentTarget);
    const password = String(fields.get('password') ?? '');
    if (password !== String(fields.get('confirmPassword') ?? '')) {
      setError('Those two do not match.');
      return;
    }
    setPending(true);
    setError('');
    try {
      const result = await studioFetch<{ workspace: string }>(
        `/api/invitations/${encodeURIComponent(token)}`,
        {
          method: 'POST',
          body: JSON.stringify({ name: String(fields.get('name') ?? ''), password }),
        },
      );
      window.location.assign(`/studio/${result.workspace}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to accept this invitation.');
      setPending(false);
    }
  }

  return (
    <Frame>
      <main id="main" tabIndex={-1} className="studio-container studio-narrow">
        {invitation === undefined ? (
          <p className="studio-hint">Checking this invitation…</p>
        ) : invitation === null ? (
          <div className="studio-page-heading">
            <h1>This invitation is no longer valid.</h1>
            <p>
              It may have been used already, withdrawn, or simply run out. Ask whoever sent it for a
              new one.
            </p>
          </div>
        ) : (
          <>
            <div className="studio-page-heading">
              <h1>Join {invitation.workspaceName}.</h1>
              <p>
                You have been invited as <strong>{invitation.email}</strong>, and you will be able
                to{' '}
                {invitation.role === 'manage'
                  ? 'write and publish here'
                  : 'read what is published here'}
                . Choose a password to finish.
              </p>
            </div>
            <form className="studio-card studio-form" onSubmit={submit}>
              {error && <ErrorNotice error={error} />}
              <label>
                Your name
                <input name="name" required maxLength={120} autoComplete="name" />
              </label>
              <label>
                Password
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  aria-describedby="invite-password-hint"
                  required
                  minLength={12}
                  maxLength={200}
                />
              </label>
              <p className="studio-hint" id="invite-password-hint">
                At least twelve characters.
              </p>
              <label>
                Password again
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
                Join {invitation.workspaceName}
              </Button>
            </form>
          </>
        )}
      </main>
    </Frame>
  );
}
