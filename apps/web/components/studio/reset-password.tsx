'use client';
import { useEffect, useState, type FormEvent } from 'react';
import type { PasswordResetPreview } from '@guide/contracts';
import { Button } from '@guide/ui';
import { Frame, ErrorNotice } from './frame';
import { studioFetch, StudioError } from './transport';
import * as X from './studio-styles';
export function formatLinkExpiry(iso: string, locale?: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
    timeZone,
  }).format(new Date(iso));
}
export function ResetPassword({ token }: { token: string }) {
  const [preview, setPreview] = useState<PasswordResetPreview | null>();
  const [error, setError] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError('');
    studioFetch<PasswordResetPreview>(`/api/password-resets/${token}`)
      .then((result) => {
        if (active) setPreview(result);
      })
      .catch((e) => {
        if (!active) return;
        if (e instanceof StudioError && e.status === 404) setPreview(null);
        else setError(e instanceof Error ? e.message : 'Unable to check this link.');
      });
    return () => {
      active = false;
    };
  }, [token, attempt]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const form = e.currentTarget;
    const data = new FormData(form);
    const password = String(data.get('password') ?? '');
    setError('');
    setFieldError('');
    if (password !== String(data.get('confirm') ?? '')) {
      setFieldError('Those two do not match.');
      (form.elements.namedItem('confirm') as HTMLInputElement).focus();
      return;
    }
    setPending(true);
    try {
      const result = await studioFetch<{ redirect: string }>(`/api/password-resets/${token}`, {
        method: 'POST',
        body: JSON.stringify({ password }),
      });
      window.location.assign(result.redirect === '/studio' ? '/studio' : '/sign-in');
    } catch (error) {
      if (error instanceof StudioError && error.status === 404) setPreview(null);
      else setError(error instanceof Error ? error.message : 'Unable to set this password.');
      setPending(false);
    }
  }
  return (
    <Frame>
      <main id="main" tabIndex={-1} className={X.narrowContainer}>
        {preview === undefined ? (
          <>
            <p role="status">Checking this link…</p>
            {error && (
              <>
                <ErrorNotice error={error} />
                <Button onClick={() => setAttempt((x) => x + 1)}>Try again</Button>
              </>
            )}
          </>
        ) : preview === null ? (
          <>
            <h1>This reset link is no longer valid.</h1>
            <p>Ask an administrator of this Passdown installation for a new one.</p>
          </>
        ) : (
          <>
            <h1>Choose a new password</h1>
            <p>
              For <strong>{preview.email}</strong>. Choosing one signs this account out everywhere
              it is signed in. This link works until {formatLinkExpiry(preview.expiresAt)}.
            </p>
            {preview.signedInAs && (
              <p className={X.notice}>
                You are signed in as {preview.signedInAs}. This link is for {preview.email}.
                Continuing signs you out of {preview.signedInAs}.
              </p>
            )}
            <form className={X.form} onSubmit={submit}>
              <label>
                New password
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={200}
                  required
                  aria-describedby="reset-hint"
                />
              </label>
              <p id="reset-hint" className={X.hint}>
                At least twelve characters.
              </p>
              <label>
                New password again
                <input
                  name="confirm"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={200}
                  required
                  aria-invalid={!!fieldError || undefined}
                  aria-describedby={fieldError ? 'reset-error reset-hint' : 'reset-hint'}
                />
              </label>
              <p id="reset-error" role="alert">
                {fieldError}
              </p>
              {error && <ErrorNotice error={error} />}
              <Button type="submit" loading={pending}>
                {preview.signedInAs ? 'Sign out and set password' : 'Set password and sign in'}
              </Button>
            </form>
          </>
        )}
      </main>
    </Frame>
  );
}
