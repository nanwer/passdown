'use client';
import { useRef, useState } from 'react';
import { Button, Input, Label } from '@guide/ui';
import { setupSchema } from '@guide/contracts';
const fields = [
  ['code', 'Setup code', 'text', 'one-time-code'],
  ['name', 'Your name', 'text', 'name'],
  ['email', 'Email', 'email', 'email'],
  ['password', 'Password', 'password', 'new-password'],
  ['confirmPassword', 'Confirm password', 'password', 'new-password'],
  ['workspaceName', 'Workspace name', 'text', 'organization'],
] as const;
export function SetupScreen() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [issues, setIssues] = useState<Record<string, string>>({});
  const [signIn, setSignIn] = useState(false);
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
    const parsed = setupSchema.safeParse(input);
    const errors: Record<string, string> = {};
    if (!parsed.success)
      for (const issue of parsed.error.issues) errors[String(issue.path[0])] = issue.message;
    if (data.password !== confirmPassword) errors.confirmPassword = 'The passwords do not match.';
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
        body: JSON.stringify(input),
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok) {
        if (body.signIn === 'manual') {
          setSignIn(true);
          report('Setup finished. Sign in with the email and password you just chose.');
        } else {
          setMessage('Passdown is ready.');
          window.location.assign('/studio');
        }
      } else if (response.status === 404) {
        setSignIn(true);
        report('This installation is already set up.');
      } else if (response.status === 429) report('Too many attempts. Wait a minute and try again.');
      else {
        const error = body.error;
        const serverIssues: Record<string, string> = {};
        for (const issue of error?.issues ?? []) serverIssues[issue.path] = issue.message;
        if (error?.code === 'SETUP_CODE_INVALID') serverIssues.code = error.message;
        report(
          (error?.message ?? 'Setup may have finished. Reload this page before trying again.') +
            (error?.requestId ? ` Reference: ${error.requestId}` : ''),
          serverIssues,
        );
      }
    } catch {
      report(
        'Setup may have finished. Reload this page. If setup is no longer available, sign in with the email and password you chose; otherwise try again.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="mx-auto w-full max-w-xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Set up Passdown</h1>
      <p className="mt-3 text-muted-foreground">
        Enter the setup code shown when this installation’s settings were created, then create the
        first administrator account.
      </p>
      <div ref={alert} role="alert" tabIndex={-1} className="mt-4 break-words" hidden={!message}>
        {message}
        {signIn && (
          <p className="mt-3">
            <a className="underline" href="/sign-in">
              Sign in
            </a>
          </p>
        )}
      </div>
      {!signIn && (
        <form ref={form} method="post" onSubmit={submit} noValidate className="mt-6 space-y-4">
          {fields.map(([name, label, type, autoComplete], index) => (
            <div key={name}>
              <Label htmlFor={`setup-${name}`}>{label}</Label>
              <Input
                id={`setup-${name}`}
                className="text-foreground"
                name={name}
                type={type}
                autoComplete={autoComplete}
                autoFocus={index === 0}
                readOnly={busy}
                required
                maxLength={
                  name === 'code' ? 64 : name === 'name' ? 120 : name === 'workspaceName' ? 80 : 200
                }
                minLength={type === 'password' ? 12 : 1}
                autoCapitalize={name === 'code' ? 'characters' : undefined}
                spellCheck={name === 'code' ? false : undefined}
                aria-invalid={Boolean(issues[name])}
                aria-describedby={issues[name] ? `setup-${name}-error` : undefined}
              />
              {issues[name] && (
                <p id={`setup-${name}-error`} className="mt-1 text-sm text-error">
                  {issues[name]}
                </p>
              )}
            </div>
          ))}
          <p className="text-sm text-muted-foreground">
            Use a password between 12 and 200 characters.
          </p>
          <Button type="submit" disabled={busy} loading={busy}>
            {busy ? 'Setting up…' : 'Create installation'}
          </Button>
        </form>
      )}
    </main>
  );
}
