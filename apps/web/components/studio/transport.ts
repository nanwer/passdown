export class StudioError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}
export async function studioFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'same-origin',
    cache: 'no-store',
    // Only a JSON body gets a JSON content type. Declaring it for FormData
    // suppresses the multipart boundary the browser would otherwise generate,
    // and the request arrives at the server unparseable.
    headers: typeof init?.body === 'string' ? { 'Content-Type': 'application/json' } : undefined,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = typeof result?.error === 'object' ? result.error : result;
    throw new StudioError(
      detail?.message ||
        (response.status === 503
          ? 'Local storage is not configured. Ask the local operator to run setup and use LOCAL_ACCESS.md.'
          : 'The request could not be completed. Try again.'),
      response.status,
      detail?.code || 'REQUEST_FAILED',
    );
  }
  return result as T;
}
