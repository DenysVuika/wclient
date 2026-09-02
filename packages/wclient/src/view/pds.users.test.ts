import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { getPdsUsersReport, renderPdsUsersReportTable, syncPdsProfileCache } from './pds.users';
import type { ListReposResponse } from '../api';
import type { CachedResponse } from '../http/cache';
import type { ApiClient } from '../http/client';
import { WClient } from '../wclient';
import { getProfileFromCache, saveProfileToCache, saveRepoStateToCache } from './profile-cache';

type ListReposFn = WClient['sync']['listRepos'];

function toCachedResponse(data: ListReposResponse): CachedResponse<ListReposResponse> {
  return {
    fromCache: false,
    data,
  };
}

describe('pds.users report', () => {
  it('aggregates paginated repos into user totals', async () => {
    const listRepos = vi
      .fn<ListReposFn>()
      .mockResolvedValueOnce(
        toCachedResponse({
          repos: [
            { did: 'did:plc:a', rev: '1', head: 'h1', active: true },
            { did: 'did:plc:b', rev: '2', head: 'h2', active: false },
          ],
          cursor: 'next-page',
        })
      )
      .mockResolvedValueOnce(
        toCachedResponse({
          repos: [{ did: 'did:plc:c', rev: '3', head: 'h3', active: true }],
        })
      );

    const client = new WClient();
    client.sync.listRepos = listRepos;

    const report = await getPdsUsersReport(client);

    expect(report).toEqual({
      users: 3,
      activeUsers: 2,
      inactiveUsers: 1,
    });
    expect(listRepos).toHaveBeenCalledTimes(2);
    expect(listRepos).toHaveBeenNthCalledWith(1, undefined);
    expect(listRepos).toHaveBeenNthCalledWith(2, { cursor: 'next-page' });
  });

  it('renders an ascii table', () => {
    const output = renderPdsUsersReportTable(
      {
        users: 1_000,
        activeUsers: 750,
        inactiveUsers: 250,
      },
      new Date('2026-07-25T00:00:00Z')
    );

    expect(output).toContain('PDS Users: 25 July 2026');
    expect(output).toContain('| Active users   |   750 |');
    expect(output).toContain('| Inactive users |   250 |');
    expect(output).toContain('| Total users    | 1,000 |');
  });

  it('reports pagination progress', async () => {
    const listRepos = vi
      .fn<ListReposFn>()
      .mockResolvedValueOnce(
        toCachedResponse({
          repos: [
            { did: 'did:plc:a', rev: '1', head: 'h1', active: true },
            { did: 'did:plc:b', rev: '2', head: 'h2', active: false },
          ],
          cursor: 'next-page',
        })
      )
      .mockResolvedValueOnce(
        toCachedResponse({
          repos: [{ did: 'did:plc:c', rev: '3', head: 'h3', active: true }],
        })
      );

    const client = new WClient();
    client.sync.listRepos = listRepos;

    const progressEvents: Array<{ pagesFetched: number; usersSoFar: number }> = [];

    await getPdsUsersReport(client, {
      onProgress: (progress) => {
        progressEvents.push(progress);
      },
    });

    expect(progressEvents).toEqual([
      { pagesFetched: 1, usersSoFar: 2 },
      { pagesFetched: 2, usersSoFar: 3 },
    ]);
  });

  it('fetches uncached profiles in parallel with a concurrency limit', async () => {
    const originalCwd = process.cwd();
    const cacheDir = mkdtempSync(join(tmpdir(), 'wclient-pds-users-'));
    process.chdir(cacheDir);

    const repos = Array.from({ length: 4 }, (_, index) => ({
      did: `did:plc:${index}`,
      rev: String(index),
      head: `h${index}`,
      active: true,
    }));
    const listRepos = vi.fn<ListReposFn>().mockResolvedValueOnce(
      toCachedResponse({
        repos,
      })
    );

    let activeRequests = 0;
    let maxActiveRequests = 0;
    const request = vi.fn<ApiClient['request']>(async (options) => {
      activeRequests += 1;
      maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
      await new Promise((resolve) => setTimeout(resolve, 10));
      activeRequests -= 1;

      const actor = String(options.query?.actor);
      return new Response(
        JSON.stringify({
          did: actor,
          handle: `${actor}.test`,
          wsocialAccountType: 'human',
          wsocialVerified: 'wid',
        })
      );
    });

    const client = new WClient();
    client.sync.listRepos = listRepos;
    client.apiClient.request = request;

    try {
      const report = await getPdsUsersReport(client, {
        withProfiles: true,
        profileFetchConcurrency: 2,
      });

      expect(request).toHaveBeenCalledTimes(4);
      expect(maxActiveRequests).toBe(2);
      expect(report).toMatchObject({
        humanUsers: 4,
        verifiedByWid: 4,
      });
    } finally {
      process.chdir(originalCwd);
      rmSync(cacheDir, { force: true, recursive: true });
    }
  });

  it('uses the client base URL as the profile cache scope', async () => {
    const originalCwd = process.cwd();
    const cacheDir = mkdtempSync(join(tmpdir(), 'wclient-pds-users-'));
    process.chdir(cacheDir);

    try {
      saveProfileToCache(
        'did:plc:alice',
        {
          did: 'did:plc:alice',
          handle: 'alice.test',
          wsocialAccountType: 'human',
        },
        'https://pds-a.test'
      );
      saveProfileToCache(
        'did:plc:alice',
        {
          did: 'did:plc:alice',
          handle: 'alice.test',
          wsocialAccountType: 'bot',
        },
        'https://pds-b.test'
      );

      const client = new WClient({ baseUrl: 'https://pds-b.test' });
      client.sync.listRepos = vi.fn<ListReposFn>().mockResolvedValueOnce(
        toCachedResponse({
          repos: [{ did: 'did:plc:alice', rev: '1', head: 'h1', active: true }],
        })
      );
      client.apiClient.request = vi.fn<ApiClient['request']>(async () => {
        throw new Error('expected profile to be loaded from cache');
      });

      const report = await getPdsUsersReport(client, { withProfiles: true });

      expect(client.apiClient.request).not.toHaveBeenCalled();
      expect(report).toMatchObject({
        botUsers: 1,
        humanUsers: 0,
      });
    } finally {
      process.chdir(originalCwd);
      rmSync(cacheDir, { force: true, recursive: true });
    }
  });

  it('refreshes a cached report profile when repo head or rev changes', async () => {
    const originalCwd = process.cwd();
    const cacheDir = mkdtempSync(join(tmpdir(), 'wclient-pds-users-'));
    process.chdir(cacheDir);

    try {
      saveProfileToCache(
        'did:plc:alice',
        {
          did: 'did:plc:alice',
          handle: 'old.test',
          wsocialAccountType: 'human',
        },
        'https://pds.test'
      );
      saveRepoStateToCache('did:plc:alice', { active: true, head: 'old-head', rev: 'old-rev' }, 'https://pds.test');

      const client = new WClient({ baseUrl: 'https://pds.test' });
      client.sync.listRepos = vi.fn<ListReposFn>().mockResolvedValueOnce(
        toCachedResponse({
          repos: [{ did: 'did:plc:alice', rev: 'new-rev', head: 'new-head', active: true }],
        })
      );
      client.apiClient.request = vi.fn<ApiClient['request']>(async () => {
        return new Response(
          JSON.stringify({
            did: 'did:plc:alice',
            handle: 'new.test',
            wsocialAccountType: 'bot',
          })
        );
      });

      const report = await getPdsUsersReport(client, { withProfiles: true });

      expect(client.apiClient.request).toHaveBeenCalledTimes(1);
      expect(report).toMatchObject({
        botUsers: 1,
        humanUsers: 0,
      });
      expect(getProfileFromCache('did:plc:alice', 'https://pds.test')).toMatchObject({
        handle: 'new.test',
      });
    } finally {
      process.chdir(originalCwd);
      rmSync(cacheDir, { force: true, recursive: true });
    }
  });

  it('fills the PDS profile cache without refetching existing profiles', async () => {
    const originalCwd = process.cwd();
    const cacheDir = mkdtempSync(join(tmpdir(), 'wclient-pds-users-'));
    process.chdir(cacheDir);

    try {
      saveProfileToCache(
        'did:plc:cached',
        {
          did: 'did:plc:cached',
          handle: 'cached.test',
        },
        'https://pds.test'
      );

      const client = new WClient({ baseUrl: 'https://pds.test' });
      client.sync.listRepos = vi.fn<ListReposFn>().mockResolvedValueOnce(
        toCachedResponse({
          repos: [
            { did: 'did:plc:cached', rev: '1', head: 'h1', active: true },
            { did: 'did:plc:fresh', rev: '2', head: 'h2', active: true },
          ],
        })
      );
      client.apiClient.request = vi.fn<ApiClient['request']>(async (options) => {
        const actor = String(options.query?.actor);
        return new Response(
          JSON.stringify({
            did: actor,
            handle: 'fresh.test',
          })
        );
      });

      const progressEvents: Array<{ profilesChecked: number; usersSeen: number }> = [];

      const result = await syncPdsProfileCache(client, {
        onProgress: (progress) => {
          progressEvents.push({
            profilesChecked: progress.profilesChecked,
            usersSeen: progress.usersSeen,
          });
        },
      });

      expect(client.apiClient.request).toHaveBeenCalledTimes(1);
      expect(client.apiClient.request).toHaveBeenCalledWith(
        expect.objectContaining({
          query: { actor: 'did:plc:fresh' },
        })
      );
      expect(result).toMatchObject({
        pds: 'https://pds.test',
        activeUsers: 2,
        inactiveUsers: 0,
        usersSeen: 2,
        profilesChecked: 2,
        cacheHits: 1,
        profilesFetched: 1,
        profilesFailed: 0,
        cacheSize: 2,
      });
      expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(progressEvents.at(-1)).toEqual({ profilesChecked: 2, usersSeen: 2 });
    } finally {
      process.chdir(originalCwd);
      rmSync(cacheDir, { force: true, recursive: true });
    }
  });

  it('refreshes a cached sync profile when repo head or rev changes', async () => {
    const originalCwd = process.cwd();
    const cacheDir = mkdtempSync(join(tmpdir(), 'wclient-pds-users-'));
    process.chdir(cacheDir);

    try {
      saveProfileToCache('did:plc:alice', { did: 'did:plc:alice', handle: 'old.test' }, 'https://pds.test');
      saveRepoStateToCache('did:plc:alice', { active: true, head: 'old-head', rev: 'old-rev' }, 'https://pds.test');

      const client = new WClient({ baseUrl: 'https://pds.test' });
      client.sync.listRepos = vi.fn<ListReposFn>().mockResolvedValueOnce(
        toCachedResponse({
          repos: [{ did: 'did:plc:alice', rev: 'new-rev', head: 'new-head', active: true }],
        })
      );
      client.apiClient.request = vi.fn<ApiClient['request']>(async () => {
        return new Response(JSON.stringify({ did: 'did:plc:alice', handle: 'new.test' }));
      });

      const result = await syncPdsProfileCache(client);

      expect(client.apiClient.request).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({
        cacheHits: 0,
        profilesFetched: 1,
        profilesFailed: 0,
      });
      expect(getProfileFromCache('did:plc:alice', 'https://pds.test')).toMatchObject({
        handle: 'new.test',
      });
    } finally {
      process.chdir(originalCwd);
      rmSync(cacheDir, { force: true, recursive: true });
    }
  });

  it('summarizes failed profile fetches during PDS cache sync', async () => {
    const originalCwd = process.cwd();
    const cacheDir = mkdtempSync(join(tmpdir(), 'wclient-pds-users-'));
    process.chdir(cacheDir);

    try {
      const client = new WClient({ baseUrl: 'https://pds.test' });
      client.sync.listRepos = vi.fn<ListReposFn>().mockResolvedValueOnce(
        toCachedResponse({
          repos: [
            { did: 'did:plc:ok', rev: '1', head: 'h1', active: true },
            { did: 'did:plc:failed', rev: '2', head: 'h2', active: false, status: 'deactivated' },
          ],
        })
      );
      client.apiClient.request = vi.fn<ApiClient['request']>(async (options) => {
        const actor = String(options.query?.actor);
        if (actor === 'did:plc:failed') {
          return new Response('Nope', { status: 503, statusText: 'Service Unavailable' });
        }

        return new Response(
          JSON.stringify({
            did: actor,
            handle: 'ok.test',
          })
        );
      });

      const result = await syncPdsProfileCache(client);

      expect(result).toMatchObject({
        activeUsers: 1,
        inactiveUsers: 1,
        usersSeen: 2,
        profilesChecked: 2,
        profilesFetched: 1,
        profilesFailed: 1,
        cacheSize: 1,
      });
      expect(result.failedProfiles).toEqual([
        {
          active: false,
          did: 'did:plc:failed',
          error: 'Request failed: 503 Service Unavailable',
          status: 'deactivated',
        },
      ]);
    } finally {
      process.chdir(originalCwd);
      rmSync(cacheDir, { force: true, recursive: true });
    }
  });
});
