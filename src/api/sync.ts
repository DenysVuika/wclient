import type { ApiClient } from '../http/client';
import type { CachedResponse } from '../http/cache';

export type RepoStatus = 'takendown' | 'suspended' | 'deleted' | 'deactivated' | 'desynchronized' | 'throttled';

export type RepoSummary = {
  did: string;
  rev: string;
  head: string;
  active?: boolean;
  status?: RepoStatus;
};

export type ListReposResponse = {
  repos: RepoSummary[];
  cursor?: string;
};

export async function listRepos(
  api: ApiClient,
): Promise<CachedResponse<ListReposResponse>> {
  return api.requestWithCache<ListReposResponse>('com.atproto.sync.listRepos', {
    path: 'com.atproto.sync.listRepos',
  });
}
