import 'server-only';
import { headers } from 'next/headers';
import { createApplicationStore, createIdentity } from '@guide/database';
import { ApplicationError } from '@guide/contracts';
import type { Actor } from '@guide/core';
import { assertOrigin } from './http';

type Application = {
  store: ReturnType<typeof createApplicationStore>;
  identity: ReturnType<typeof createIdentity>;
  /**
   * The same identity, with sign-up open.
   *
   * Sign-up stays disabled on the public surface: nobody creates an account
   * here by deciding to. This instance exists so that accepting an invitation
   * can create the one account that a manager of a workspace already
   * authorised by name, and it is never reachable from a route that has not
   * checked a token first.
   */
  invitedSignUp: ReturnType<typeof createIdentity>;
  origin: string;
};
const applicationGlobal = globalThis as typeof globalThis & { guideApplication?: Application };
export function isConfigured() {
  return Boolean(process.env.GUIDE_DATABASE_URL);
}
export function getApplication(): Application {
  if (applicationGlobal.guideApplication) return applicationGlobal.guideApplication;
  const connectionString = process.env.GUIDE_DATABASE_URL;
  const secret = process.env.BETTER_AUTH_SECRET;
  const baseURL = process.env.BETTER_AUTH_URL;
  if (!connectionString || !secret || !baseURL)
    throw new ApplicationError(
      'CONFIGURATION_REQUIRED',
      'Local authoring is not configured yet. Run pnpm local:setup, then restart the app.',
      503,
    );
  const identity = createIdentity({ connectionString, secret, baseURL });
  const invitedSignUp = createIdentity({ connectionString, secret, baseURL, allowSignUp: true });
  const store = createApplicationStore({ connectionString });
  return (applicationGlobal.guideApplication = {
    store,
    identity,
    invitedSignUp,
    origin: new URL(baseURL).origin,
  });
}
export async function currentSession(requestHeaders?: Headers) {
  if (!isConfigured()) return null;
  const session = await getApplication().identity.api.getSession({
    headers: requestHeaders ?? (await headers()),
  });
  if (!session || !session.user.emailVerified || session.user.active !== true) return null;
  return session;
}
export async function currentActor(requestHeaders?: Headers): Promise<Actor> {
  const session = await currentSession(requestHeaders);
  return session ? { kind: 'user', id: session.user.id, active: true } : { kind: 'anonymous' };
}
export async function requireSession(request: Request) {
  getApplication();
  const session = await currentSession(request.headers);
  if (!session) throw new ApplicationError('UNAUTHENTICATED', 'Sign in to continue.', 401);
  // An account created for someone — the first administrator, or anyone
  // invited later — can do nothing until its password has been replaced.
  //
  // The check lives here rather than in a redirect because this is the one
  // gate every studio route passes through, browser or not. Forcing
  // a reset in the interface while exempting /api leaves the credentials an
  // installation shipped with working indefinitely for anyone who skips the UI.
  if (session.user.mustChangePassword)
    throw new ApplicationError(
      'PASSWORD_CHANGE_REQUIRED',
      'Choose a new password before continuing.',
      403,
    );
  return { session, actor: { kind: 'user', id: session.user.id, active: true } as const };
}
export async function enforceRateLimit(key: string, limit: number, seconds = 60) {
  if (!(await getApplication().store.consumeRateLimit(key, limit, seconds)))
    throw new ApplicationError(
      'RATE_LIMITED',
      'Too many requests. Please wait a minute and try again.',
      429,
    );
}
export async function mutationContext(request: Request) {
  const app = getApplication();
  assertOrigin(request, app.origin);
  const { actor, session } = await requireSession(request);
  await enforceRateLimit('mutations:global', 1000);
  await enforceRateLimit(`mutations:${actor.id}`, 120);
  return { ...app, actor, session };
}
