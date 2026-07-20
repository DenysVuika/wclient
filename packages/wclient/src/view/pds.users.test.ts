import { describe, expect, it, vi } from 'vitest';
import { getPdsUsersReport, renderPdsUsersReportTable } from './pds.users';
import type { ListReposResponse } from '../api';
import type { CachedResponse } from '../http/cache';
import { WClient } from '../wclient';

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
    const output = renderPdsUsersReportTable({
      users: 1_000,
      activeUsers: 750,
      inactiveUsers: 250,
    });

    expect(output).toContain('PDS Users Report');
    expect(output).toContain('| Users          | 1,000 |');
    expect(output).toContain('| Active users   |   750 |');
    expect(output).toContain('| Inactive users |   250 |');
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
});
