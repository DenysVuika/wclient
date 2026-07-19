type Cached<T> = { etag: string; data: T };
export type CachedResponse<T> = { fromCache: boolean; data: T };

const responseCache = new Map<string, Cached<unknown>>();

export async function fetchWithEtagCache<T>(
  key: string,
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch = fetch
): Promise<CachedResponse<T>> {
  const existing = responseCache.get(key) as Cached<T> | undefined;
  const requestHeaders = new Headers(init.headers);
  if (existing?.etag) {
    requestHeaders.set('If-None-Match', existing.etag);
  }

  const res = await fetchImpl(url, {
    ...init,
    headers: requestHeaders,
  });

  console.log('Response status:', res.status);
  console.log('Response headers:', res.headers);

  if (res.status === 304 && existing) {
    return { fromCache: true, data: existing.data };
  }

  if (!res.ok) {
    throw new Error(`Request failed: ${res.status} ${res.statusText}`);
  }

  const etag = res.headers.get('etag');

  // Some endpoints return 200 even when content is unchanged.
  if (etag && existing && etag === existing.etag) {
    console.log('ETag matches cached value. Returning cached data.');
    return { fromCache: true, data: existing.data };
  }

  const data = (await res.json()) as T;

  if (etag) {
    responseCache.set(key, { etag, data });
  }

  return { fromCache: false, data };
}
