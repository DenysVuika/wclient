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

export type ListReposOptions = {
  cursor?: string;
  limit?: number;
};

export type SyncService = {
  listRepos: (options?: ListReposOptions) => Promise<CachedResponse<ListReposResponse>>;
};

export async function listRepos(
  api: ApiClient,
  options?: ListReposOptions
): Promise<CachedResponse<ListReposResponse>> {
  const query = {
    ...(options?.cursor !== undefined ? { cursor: options.cursor } : {}),
    ...(options?.limit !== undefined ? { limit: options.limit } : {}),
  };

  return api.requestWithCache<ListReposResponse>('com.atproto.sync.listRepos', {
    path: 'com.atproto.sync.listRepos',
    query,
  });
}
