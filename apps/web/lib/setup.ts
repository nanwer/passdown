import 'server-only';
import { createHash, timingSafeEqual } from 'node:crypto';
import { getApplication, isConfigured } from './application';
let complete = false;
export async function setupRequired() {
  if (complete || !isConfigured()) return false;
  const required = await getApplication().store.setupRequired();
  if (!required) complete = true;
  return required;
}
export function setupCodeMatches(code: string, hash: Buffer) {
  const normal = code.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
  return hash.length === 32 && timingSafeEqual(createHash('sha256').update(normal).digest(), hash);
}
