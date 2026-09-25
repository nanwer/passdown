'use client';
import { useEffect, useRef, useState } from 'react';
import type { AdminAccount, IssuedPasswordReset } from '@guide/contracts';
import { Button, Dialog } from '@guide/ui';
import { SessionGate, ErrorNotice } from './frame';
import { studioFetch, errorMessage, type ErrorMessage } from './transport';
import { formatLinkExpiry } from './reset-password';
import { TableSearch, tableClass, cellClass } from '../structured/data-table';
import * as X from './studio-styles';
function ResetLinkDialog({ account, refresh }: { account: AdminAccount; refresh: () => void }) {
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [issued, setIssued] = useState<IssuedPasswordReset | null>(null),
    [cancelled, setCancelled] = useState(false),
    [error, setError] = useState<ErrorMessage>(''),
    [status, setStatus] = useState('');
  const input = useRef<HTMLInputElement>(null),
    done = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (issued) {
      input.current?.focus();
      input.current?.select();
    }
    if (cancelled) done.current?.querySelector('button')?.focus();
  }, [issued, cancelled]);
  const endpoint = `/api/admin/accounts/${account.id}/password-reset`;
  async function issue() {
    setBusy(true);
    setError('');
    try {
      setIssued(await studioFetch<IssuedPasswordReset>(endpoint, { method: 'POST' }));
      setStatus('Reset link created.');
      refresh();
    } catch (e) {
      setError(errorMessage(e, 'Unable to create this link.'));
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    setBusy(true);
    setError('');
    try {
      await studioFetch(endpoint, { method: 'DELETE' });
      setIssued(null);
      setCancelled(true);
      setStatus('Link cancelled. It no longer works.');
      refresh();
    } catch (e) {
      setError(errorMessage(e, 'The link could not be cancelled. It still works. Try again.'));
    } finally {
      setBusy(false);
    }
  }
  async function copyLink() {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.link);
      setStatus('Link copied.');
    } catch {
      setStatus('Select the link and copy it.');
    }
  }
  return (
    <Dialog
      open={open}
      closeDisabled={busy}
      onOpenChange={(value) => {
        if (!busy) {
          setOpen(value);
          if (!value) {
            setIssued(null);
            setCancelled(false);
            setStatus('');
            setError('');
          }
        }
      }}
      trigger={
        <Button variant="secondary" aria-label={`Create reset link for ${account.name}`}>
          Create reset link…
        </Button>
      }
      title="Create a password reset link?"
      description={`For ${account.name} (${account.email}).`}
    >
      <div className={X.form}>
        {!issued && !cancelled ? (
          <>
            <p>
              Whoever holds this link can choose a new password for this account. It works once, for
              24 hours.
            </p>
            <p>
              When it is used, {account.name} is signed out everywhere. Any earlier link stops
              working now; the current password works until this link is used.
            </p>
            <p>Pass it on privately through a channel only they can read. Nothing is emailed.</p>
            <div className={X.actions}>
              <Button loading={busy} onClick={() => void issue()}>
                Create link
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </>
        ) : issued ? (
          <>
            <p>Send this link to {account.name}. It is shown only here.</p>
            <input
              ref={input}
              readOnly
              value={issued.link}
              aria-label={`Reset link for ${account.name}`}
              onFocus={(e) => e.currentTarget.select()}
            />
            <p>Expires {formatLinkExpiry(issued.expiresAt)}.</p>
            <Button variant="secondary" onClick={() => void copyLink()}>
              Copy link
            </Button>
            <Button variant="secondary" loading={busy} onClick={() => void cancel()}>
              Cancel this link
            </Button>
          </>
        ) : null}
        {(issued || cancelled) && (
          <div ref={done}>
            <Button
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setIssued(null);
                setCancelled(false);
                setStatus('');
              }}
            >
              Done
            </Button>
          </div>
        )}
        {error && <ErrorNotice error={error} />}
        <p role="status" aria-live="polite">
          {status}
        </p>
      </div>
    </Dialog>
  );
}
function AccountsTable() {
  const [query, setQuery] = useState(''),
    [revision, setRevision] = useState(0),
    [result, setResult] = useState<{ accounts: AdminAccount[]; total: number; limit: number }>(),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<ErrorMessage>(''),
    [status, setStatus] = useState('');
  const refresh = () => setRevision((x) => x + 1);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      studioFetch<{ accounts: AdminAccount[]; total: number; limit: number }>(
        `/api/admin/accounts?q=${encodeURIComponent(query)}`,
      )
        .then((r) => {
          if (active) {
            setResult(r);
            setError('');
          }
        })
        .catch((e) => {
          if (active) setError(errorMessage(e, 'Unable to load accounts.'));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, revision]);
  async function cancel(account: AdminAccount) {
    try {
      await studioFetch(`/api/admin/accounts/${account.id}/password-reset`, { method: 'DELETE' });
      setStatus(`Reset link for ${account.name} cancelled.`);
      refresh();
    } catch (e) {
      setError(errorMessage(e, 'Unable to cancel this link.'));
    }
  }
  return (
    <main id="main" tabIndex={-1} className={X.container}>
      <p>Administration / Accounts</p>
      <h1>Accounts</h1>
      <p>
        Everyone who can sign in to this installation. Create a reset link for someone who has lost
        their password; nothing is emailed, so pass it on yourself. Another administrator's password
        is reset from the server.
      </p>
      <TableSearch
        label="Search accounts"
        placeholder="Search accounts"
        value={query}
        onChange={setQuery}
      />
      <p role="status">
        {loading
          ? 'Loading accounts…'
          : result
            ? `${result.accounts.length} of ${result.total} accounts`
            : ''}
      </p>
      <p role="status" aria-live="polite">
        {status}
      </p>
      {error && (
        <>
          <ErrorNotice error={error} />
          <Button onClick={refresh}>Try again</Button>
        </>
      )}
      {result && !result.accounts.length && !loading ? (
        <>
          <p>No account matches “{query}”.</p>
          <Button onClick={() => setQuery('')}>Clear search</Button>
        </>
      ) : (
        result && (
          <div className="max-w-full overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  {['Name', 'Email', 'Workspaces', 'Status', 'Actions'].map((label) => (
                    <th key={label} className={cellClass} scope="col">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.accounts.map((account) => (
                  <tr key={account.id}>
                    <td className={cellClass}>
                      {account.name}
                      {account.isYou && <span> · You</span>}
                      {account.isAdministrator && <span> · Administrator</span>}
                    </td>
                    <td className={cellClass}>{account.email}</td>
                    <td className={cellClass}>
                      {account.workspaces.length
                        ? account.workspaces.map((w) => (
                            <p key={w.id}>
                              {w.name} · {w.role === 'manage' ? 'Manage' : 'View'}
                            </p>
                          ))
                        : 'No workspace'}
                    </td>
                    <td className={cellClass}>
                      {account.status === 'active'
                        ? 'Active'
                        : account.status === 'suspended'
                          ? 'Suspended'
                          : 'Address not confirmed'}
                      {account.mustChangePassword && <p>Must choose a password</p>}
                      {account.pendingReset && (
                        <p>
                          Reset link pending until{' '}
                          {formatLinkExpiry(account.pendingReset.expiresAt)}
                          {account.pendingReset.issuedVia === 'operator'
                            ? ' · from the command line'
                            : ''}
                        </p>
                      )}
                    </td>
                    <td className={cellClass}>
                      {account.isYou ? (
                        <a href="/account">Change it in Your account</a>
                      ) : account.isAdministrator ? (
                        // One administrator could otherwise take over another's
                        // account; the database refuses it too (migration 034).
                        <p className={X.hint}>
                          Another administrator's password can only be reset from the server:{' '}
                          <code className="break-all">
                            docker compose run --rm ops reset-password --email {account.email}
                          </code>
                        </p>
                      ) : account.status === 'active' ? (
                        <ResetLinkDialog account={account} refresh={refresh} />
                      ) : null}
                      {account.pendingReset && (
                        <Button
                          variant="ghost"
                          aria-label={`Cancel reset link for ${account.name}`}
                          onClick={() => void cancel(account)}
                        >
                          Cancel link
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </main>
  );
}
export function AdminAccounts() {
  return (
    <SessionGate>
      {(session) =>
        session.isAdministrator ? (
          <AccountsTable />
        ) : (
          <main id="main" className={X.container}>
            <h1>Page not found</h1>
          </main>
        )
      }
    </SessionGate>
  );
}
