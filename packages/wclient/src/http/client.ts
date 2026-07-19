import { fetchWithEtagCache, type CachedResponse } from './cache';

export type AuthProvider = {
  getAccessToken: () => string | undefined;
  refreshAccessToken: () => Promise<boolean>;
};

type QueryValue = string | number | boolean | null | undefined;

type ApiRequestOptions = {
  path: string;
  method?: string;
  query?: Record<string, QueryValue>;
  headers?: HeadersInit;
  authToken?: string;
  body?: BodyInit | null;
};

export type ApiClient = ReturnType<typeof createApiClient>;

function toQueryString(query?: Record<string, QueryValue>): string {
  if (!query) {
    return '';
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : '';
}

function createFetchWithAuthRetry(auth?: AuthProvider) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const response = await fetch(input, init);

    if (response.status !== 401 || !auth) {
      return response;
    }

    const refreshed = await auth.refreshAccessToken();
    if (!refreshed) {
      return response;
    }

    const retryHeaders = new Headers(init?.headers);
    const nextToken = auth.getAccessToken();
    if (!nextToken) {
      return response;
    }

    retryHeaders.set('Authorization', `Bearer ${nextToken}`);

    return fetch(input, {
      ...init,
      headers: retryHeaders,
    });
  };
}

export function createApiClient(getBaseUrl: () => string, auth?: AuthProvider) {
  const fetchWithAuthRetry = createFetchWithAuthRetry(auth);

  function buildUrl(path: string, query?: Record<string, QueryValue>): string {
    const baseUrl = getBaseUrl();
    if (!baseUrl) {
      throw new Error('BLUESKY_SERVER is not configured');
    }

    return `${baseUrl}/xrpc/${path}${toQueryString(query)}`;
  }

  function buildHeaders(authToken?: string, headers?: HeadersInit): HeadersInit {
    const mergedHeaders = new Headers(headers);
    mergedHeaders.set('Accept-Encoding', 'gzip');
    if (authToken) {
      mergedHeaders.set('Authorization', `Bearer ${authToken}`);
    }

    return mergedHeaders;
  }

  async function request(options: ApiRequestOptions): Promise<Response> {
    const { path, method = 'GET', query, headers, authToken, body } = options;
    const url = buildUrl(path, query);
    const requestInit: RequestInit = {
      method,
      headers: buildHeaders(authToken, headers),
      ...(body !== undefined && { body }),
    };

    return fetchWithAuthRetry(url, requestInit);
  }

  async function requestWithCache<T>(cacheKey: string, options: ApiRequestOptions): Promise<CachedResponse<T>> {
    const { path, method = 'GET', query, headers, authToken, body } = options;
    const url = buildUrl(path, query);
    const requestInit: RequestInit = {
      method,
      headers: buildHeaders(authToken, headers),
      ...(body !== undefined && { body }),
    };

    return fetchWithEtagCache<T>(cacheKey, url, requestInit, fetchWithAuthRetry);
  }

  return {
    request,
    requestWithCache,
  };
}
