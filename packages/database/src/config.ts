export function localDatabaseURL(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Database configuration is missing or invalid. Run pnpm local:setup.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
  )
    throw new Error('Database must use a loopback PostgreSQL URL.');
  if (decodeURIComponent(url.username) !== 'guide_runtime')
    throw new Error('Application connections require the nonowner guide_runtime role.');
  return value;
}
export function localOrigin(value: string): string {
  const url = new URL(value);
  if (
    !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) ||
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  )
    throw new Error('Identity baseURL must be a loopback origin.');
  return url.origin;
}
