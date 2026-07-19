import { afterEach, describe, expect, it, vi } from 'vitest';
import { WClient } from './wclient';

describe('WClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('logs in and exposes repo helpers through namespaces', async () => {
    const session = {
      accessJwt: 'access-token',
      refreshJwt: 'refresh-token',
      did: 'did:plc:abc123',
      handle: 'alice.test',
      email: 'alice@example.com',
      emailConfirmed: true,
      active: true,
      wsocialVerified: 'false',
    };
    const repoInfo = {
      did: session.did,
      didDoc: { id: session.did },
      handle: session.handle,
      collections: ['app.bsky.feed.post'],
      handleIsCorrect: true,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify(session), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(repoInfo), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const client = new WClient({ baseUrl: 'https://example.test' });

    await client.login({
      identifier: 'alice@example.com',
      password: 'secret',
    });
    const result = await client.repo.describeRepo(session.did);

    expect(client.getSession()).toEqual(session);
    expect(result).toEqual(repoInfo);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
