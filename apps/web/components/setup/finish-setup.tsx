'use client';
import { useRef, useState } from 'react';
import { Button, cn } from '@guide/ui';
import { defaultLogin, finishSetupSchema } from '@guide/contracts';
import * as X from '../studio/studio-styles';
const fields = [
  ['name', 'Your name', 'text', 'name'],
  ['email', 'Your email address', 'email', 'email'],
  ['password', 'New password', 'password', 'new-password'],
  ['confirmPassword', 'New password again', 'password', 'new-password'],
  ['workspaceName', 'Workspace name', 'text', 'organization'],
] as const;
const limits: Record<string, number> = { name: 120, workspaceName: 80 };

/**
 * The only thing the default login can do (migration 033). Shown by the
 * studio in place of every page, like the forced password change: every
 * route refuses this account until the form is sent, so there is nowhere
 * else to go. Sending it replaces the address and password, creates the
 * first workspace and retires the default login together.
 */
export function FinishSetup() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [finished, setFinished] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  const alert = useRef<HTMLDivElement>(null);
  function report(text: string, errors: Record<string, string> = {}) {
    setMessage(text);
    setIssues(errors);
    requestAnimationFrame(() => {
      const first = fields.find(([name]) => errors[name]);
      if (first) (form.current?.elements.namedItem(first[0]) as HTMLInputElement)?.focus();
      else alert.current?.focus();
    });
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const { confirmPassword, ...input } = data;
    const parsed = finishSetupSchema.safeParse(input);
    const errors: Record<string, string> = {};
    if (!parsed.success)
      for (const issue of parsed.error.issues) errors[String(issue.path[0])] ??= issue.message;
    if (!errors.password && data.password !== confirmPassword)
      errors.confirmPassword = 'The passwords do not match.';
    if (Object.keys(errors).length) {
      report('Check the highlighted fields and try again.', errors);
      return;
    }
    setBusy(true);
    setMessage('');
    setIssues({});
    try {
      const response = await fetch('/api/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify(input),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        setMessage('Passdown is ready. Opening your workspace…');
        window.location.assign('/studio');
        return;
      }
      const error = body.error;
      if (response.status === 404 || response.status === 401) {
        setFinished(true);
        report(
          error?.message ?? 'Passdown is already set up. Sign in with your own email address.',
        );
      } else if (response.status === 429) report('Too many attempts. Wait a minute and try again.');
      else {
        const serverIssues: Record<string, string> = {};
        for (const issue of error?.issues ?? []) serverIssues[issue.path] ??= issue.message;
        if (error?.code === 'EMAIL_TAKEN') serverIssues.email = error.message;
        report(
          (error?.message ?? 'Setup did not finish. Nothing was changed; try again.') +
            (error?.requestId ? ` Reference: ${error.requestId}` : ''),
          serverIssues,
        );
      }
    } catch {
      report(
        'The connection was lost. Reload this page: if it still asks you to finish setting up, nothing was changed; otherwise sign in with the email address and password you chose.',
      );
    }
    setBusy(false);
  }
  return (
    <main className={X.narrowContainer} id="main" tabIndex={-1}>
      <div className={X.pageHeading}>
        <span className={X.eyebrow}>First sign-in</span>
        <h1>Finish setting up Passdown</h1>
        <p>
          You signed in with the default login. Choose your own name, email address and password,
          and name your first workspace. The default login {defaultLogin.email} stops working when
          you finish.
        </p>
      </div>
      <div
        ref={alert}
        role="alert"
        tabIndex={-1}
        className={cn(X.errorNotice, 'break-words')}
        hidden={!message}
      >
        {message}
        {finished && (
          <p className="mt-3">
            <a className="underline" href="/sign-in">
              Sign in
            </a>
          </p>
        )}
      </div>
      {!finished && (
        <form
          ref={form}
          method="post"
          onSubmit={submit}
          noValidate
          className={cn(X.card, X.form)}
          aria-label="Finish setting up"
        >
          {fields.map(([name, label, type, autoComplete], index) => (
            <div key={name} className="grid gap-2">
              <label>
                {label}
                <input
                  name={name}
                  type={type}
                  autoComplete={autoComplete}
                  autoFocus={index === 0}
                  readOnly={busy}
                  required
                  maxLength={limits[name] ?? 200}
                  minLength={type === 'password' ? 12 : 1}
                  aria-invalid={issues[name] ? true : undefined}
                  aria-describedby={
                    [
                      issues[name] ? `setup-${name}-error` : '',
                      name === 'password' ? 'setup-password-hint' : '',
                    ]
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                />
              </label>
              {/* Described rather than labelled, as in the password change:
                  inside the label this would become part of the field's name. */}
              {name === 'password' && (
                <p id="setup-password-hint" className={X.hint}>
                  Between 12 and 200 characters.
                </p>
              )}
              {issues[name] && (
                <p id={`setup-${name}-error`} className="m-0 text-[13px] text-error">
                  {issues[name]}
                </p>
              )}
            </div>
          ))}
          <Button type="submit" disabled={busy} loading={busy}>
            {busy ? 'Finishing…' : 'Finish setting up'}
          </Button>
        </form>
      )}
    </main>
  );
}
