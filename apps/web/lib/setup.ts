import 'server-only';
import type { SetupState } from '@guide/database';
import { getApplication, isConfigured } from './application';

// Setup never becomes unfinished again, so completion is remembered.
let complete = false;

/** The first-run state (see migration 033); 'complete' when not configured. */
export async function setupState(): Promise<SetupState> {
  if (complete || !isConfigured()) return 'complete';
  const state = await getApplication().store.setupState();
  if (state === 'complete') complete = true;
  return state;
}

/** Health reports setup-required until the default login has been replaced. */
export async function setupRequired() {
  return (await setupState()) !== 'complete';
}

/** Whether the sign-in page should offer the default login. */
export async function defaultLoginActive() {
  return (await setupState()) === 'default-login';
}
