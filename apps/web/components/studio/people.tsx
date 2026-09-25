'use client';
import * as X from './studio-styles';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Copy, Check, UserPlus } from 'lucide-react';
import {
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  buttonVariants,
  cardStyles,
  cn,
} from '@guide/ui';
import type { StudioWorkspace, WorkspacePeople } from '@guide/contracts';
import { ErrorNotice, SessionGate, StudioTrail } from './frame';
import { ManageTabs } from './manage';
import { studioFetch, errorMessage, type ErrorMessage } from './transport';
import './studio.css';

export function People({ workspaceId }: { workspaceId: string }) {
  return (
    <SessionGate workspaceId={workspaceId}>
      {(_, workspace) => <PeopleList workspace={workspace!} />}
    </SessionGate>
  );
}

/**
 * Who can reach this workspace.
 *
 * Members and unaccepted invitations are one list, because "who has access" is
 * one question — somebody holding a live link is as much an answer to it as
 * somebody who has already signed in.
 */
function PeopleList({ workspace }: { workspace: StudioWorkspace }) {
  const [people, setPeople] = useState<WorkspacePeople>();
  const [error, setError] = useState<ErrorMessage>('');
  const [pending, setPending] = useState(false);
  const [issued, setIssued] = useState<{ email: string; link: string }>();
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setPeople(await studioFetch<WorkspacePeople>(`/api/studio/${workspace.id}/people`));
    } catch (e) {
      setError(errorMessage(e, 'Unable to load this workspace’s people.'));
    }
  }, [workspace.id]);
  useEffect(() => {
    void load();
  }, [load]);

  async function act(run: () => Promise<unknown>) {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await run();
      await load();
    } catch (e) {
      setError(errorMessage(e, 'That did not work.'));
    } finally {
      setPending(false);
    }
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const fields = new FormData(form);
    const email = String(fields.get('email') ?? '');
    await act(async () => {
      const result = await studioFetch<{ link: string }>(`/api/studio/${workspace.id}/people`, {
        method: 'POST',
        body: JSON.stringify({ email, role: String(fields.get('role') ?? 'view') }),
      });
      setIssued({ email, link: result.link });
      setCopied(false);
      form.reset();
    });
  }

  // The database refuses to leave a workspace with nobody who can manage it.
  // Knowing that up here means the controls can explain themselves rather than
  // accepting a click and returning an error for something that was never
  // going to be allowed.
  const managers = (people?.members ?? []).filter((m) => m.role === 'manage' && m.active);

  if (workspace.role !== 'manage')
    return (
      <main id="main" tabIndex={-1} className={X.narrowContainer}>
        <ErrorNotice error="Only someone who manages this workspace can see who is in it." />
      </main>
    );

  return (
    <main id="main" tabIndex={-1} className={X.narrowContainer}>
      <div className={X.pageHeading}>
        <StudioTrail workspace={workspace} section="Manage" />
        <h1>Who can reach this workspace.</h1>
        <p>
          Someone who can <strong>view</strong> reads what has been published here. Someone who can{' '}
          <strong>manage</strong> writes, publishes, and invites others.
        </p>
      </div>
      <ManageTabs workspace={workspace} active="people" />

      <div className="grid gap-6">
        {error && <ErrorNotice error={error} />}

        <form onSubmit={invite} className={cn(cardStyles, 'p-6')}>
          <CardHeader>
            <CardTitle>Invite somebody</CardTitle>
            <CardDescription>They get a link to open. Nothing is emailed.</CardDescription>
          </CardHeader>
          <div className="grid gap-4">
            <Label>
              Email
              <Input
                name="email"
                type="email"
                required
                maxLength={200}
                placeholder="them@example.com"
              />
            </Label>
            <Label>
              They can
              <Select name="role" defaultValue="view">
                <option value="view">View — read published guides</option>
                <option value="manage">Manage — everything, including inviting people</option>
              </Select>
            </Label>
            <button type="submit" disabled={pending} className={cn(buttonVariants(), 'w-full')}>
              <UserPlus size={16} /> Create an invitation
            </button>
          </div>
        </form>

        {issued && (
          <div className={cn(X.card, 'invite-issued border-focus')}>
            <h2>Send this link to {issued.email}</h2>
            <p>
              It works once, and it is only shown here. Nothing is emailed, and this link cannot be
              recovered later — if it goes missing, revoke the invitation and make another.
            </p>
            <div className="invite-link mt-3 flex flex-wrap items-center gap-2.5 [&_code]:min-w-0 [&_code]:flex-[1_1_260px] [&_code]:rounded-[8px] [&_code]:border [&_code]:border-solid [&_code]:border-line [&_code]:bg-sunken [&_code]:px-3 [&_code]:py-2.5 [&_code]:text-[12.5px] [&_code]:wrap-anywhere">
              <code>{issued.link}</code>
              <button
                type="button"
                className={buttonVariants({ variant: 'secondary' })}
                onClick={() => {
                  void navigator.clipboard?.writeText(issued.link).then(
                    () => setCopied(true),
                    () => setCopied(false),
                  );
                }}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        <section className="[&_h2]:mx-0 [&_h2]:mt-0 [&_h2]:mb-1 [&_h2]:text-[17px]">
          <h2>In this workspace</h2>
          <ul className="people-list m-0 grid list-none gap-0.5 p-0 [&_li]:flex [&_li]:flex-wrap [&_li]:items-center [&_li]:justify-between [&_li]:gap-3 [&_li]:border-b [&_li]:border-solid [&_li]:border-b-line [&_li]:px-0 [&_li]:py-3 [&_li:last-child]:[border-bottom:0]">
            {people?.members.map((member) => (
              <li key={member.actorId}>
                <div className="people-who grid min-w-0 gap-0.5 text-[14px] [&_span]:text-[13px] [&_span]:text-muted [&_span]:wrap-anywhere">
                  <strong>
                    {member.name}
                    {member.isYou && (
                      <span className="ml-2 text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">
                        you
                      </span>
                    )}
                  </strong>
                  <span>{member.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="[&_select]:text-[13px]">
                    <span className="sr-only">Permission for {member.name}</span>
                    <select
                      value={member.role}
                      disabled={pending || (member.role === 'manage' && managers.length === 1)}
                      title={
                        member.role === 'manage' && managers.length === 1
                          ? 'The only person who can manage this workspace cannot step down. Give someone else manage first.'
                          : undefined
                      }
                      onChange={(event) =>
                        void act(() =>
                          studioFetch(`/api/studio/${workspace.id}/people/${member.actorId}`, {
                            method: 'PATCH',
                            body: JSON.stringify({ role: event.target.value }),
                          }),
                        )
                      }
                    >
                      <option value="view">View</option>
                      <option value="manage">Manage</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                    disabled={pending || (member.role === 'manage' && managers.length === 1)}
                    onClick={() => {
                      if (!window.confirm(`Remove ${member.name} from ${workspace.name}?`)) return;
                      void act(() =>
                        studioFetch(`/api/studio/${workspace.id}/people/${member.actorId}`, {
                          method: 'DELETE',
                        }),
                      );
                    }}
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
          {managers.length === 1 && (
            <p className={X.hint}>
              One person manages this workspace, so they cannot step down or be removed. Give
              someone else manage first, and the controls open up.
            </p>
          )}
        </section>

        {people && people.invitations.length > 0 && (
          <section className="[&_h2]:mx-0 [&_h2]:mt-0 [&_h2]:mb-1 [&_h2]:text-[17px]">
            <h2>Waiting to be accepted</h2>
            <ul className="people-list m-0 grid list-none gap-0.5 p-0 [&_li]:flex [&_li]:flex-wrap [&_li]:items-center [&_li]:justify-between [&_li]:gap-3 [&_li]:border-b [&_li]:border-solid [&_li]:border-b-line [&_li]:px-0 [&_li]:py-3 [&_li:last-child]:[border-bottom:0]">
              {people.invitations.map((invitation) => (
                <li key={invitation.id}>
                  <div className="people-who grid min-w-0 gap-0.5 text-[14px] [&_span]:text-[13px] [&_span]:text-muted [&_span]:wrap-anywhere">
                    <strong>{invitation.email}</strong>
                    <span>
                      {invitation.role === 'manage' ? 'Manage' : 'View'} · invited by{' '}
                      {invitation.invitedBy} · expires{' '}
                      {new Date(invitation.expiresAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                      disabled={pending}
                      onClick={() =>
                        void act(() =>
                          studioFetch(`/api/studio/${workspace.id}/invitations/${invitation.id}`, {
                            method: 'DELETE',
                          }),
                        )
                      }
                    >
                      Revoke
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </main>
  );
}
