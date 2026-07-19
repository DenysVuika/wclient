import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApiClient, type AuthProvider } from './client';

describe('createApiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('builds request URL with query params and auth header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const api = createApiClient(() => 'https://example.test');

    await api.request({
      path: 'com.atproto.repo.describeRepo',
      query: { repo: 'did:plc:abc', limit: 10, empty: undefined },
      authToken: 'jwt-token',
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://example.test/xrpc/com.atproto.repo.describeRepo?repo=did%3Aplc%3Aabc&limit=10');

    const headers = new Headers(init.headers);
    expect(headers.get('Authorization')).toBe('Bearer jwt-token');
    expect(headers.get('Accept-Encoding')).toBe('gzip');
  });

  it('refreshes auth and retries once on 401', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const auth: AuthProvider = {
      getAccessToken: () => 'next-token',
      refreshAccessToken: vi.fn().mockResolvedValue(true),
    };
    const api = createApiClient(() => 'https://example.test', auth);

    const response = await api.request({ path: 'com.atproto.sync.listRepos' });

    expect(response.status).toBe(200);
    expect(auth.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const secondInit = fetchMock.mock.calls[1]?.[1] as RequestInit;
    const secondHeaders = new Headers(secondInit.headers);
    expect(secondHeaders.get('Authorization')).toBe('Bearer next-token');
  });
});
