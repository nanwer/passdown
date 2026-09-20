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

/**
 * Uploads one file, reporting how much of it has been sent.
 *
 * fetch cannot report upload progress, so this uses XMLHttpRequest. On a slow
 * connection a large photograph takes long enough that silence reads as a
 * hang, and someone waiting with no indication will retry — sending it twice,
 * over the connection that was already the problem.
 *
 * The browser sets the multipart content type itself, including the boundary.
 * Nothing here should set it.
 */
export function studioUpload<T>(
  path: string,
  file: File,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', path);
    request.withCredentials = true;
    request.upload.addEventListener('progress', (event) => {
      // Not every connection reports a total; leave the reading alone when it
      // cannot be known rather than inventing one.
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
    });
    request.addEventListener('load', () => {
      const result = (() => {
        try {
          return JSON.parse(request.responseText) as {
            error?: { message?: string; code?: string };
          };
        } catch {
          return null;
        }
      })();
      if (request.status >= 200 && request.status < 300) {
        onProgress(1);
        resolve(result as T);
        return;
      }
      reject(
        new StudioError(
          result?.error?.message ?? 'That picture could not be added. Try again.',
          request.status,
          result?.error?.code ?? 'REQUEST_FAILED',
        ),
      );
    });
    request.addEventListener('error', () =>
      reject(
        new StudioError(
          'The upload did not reach the server. Check your connection and try again.',
          0,
          'NETWORK_ERROR',
        ),
      ),
    );
    request.addEventListener('abort', () =>
      reject(new StudioError('Upload stopped.', 0, 'ABORTED')),
    );
    if (signal) signal.addEventListener('abort', () => request.abort(), { once: true });
    const body = new FormData();
    body.append('file', file);
    request.send(body);
  });
}
