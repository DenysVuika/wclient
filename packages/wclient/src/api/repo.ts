import type { ApiClient } from '../http/client';
import type { CachedResponse } from '../http/cache';

export type RepoRecord = {
  uri: string;
  cid: string;
  value: unknown;
};

export type ListRecordsResponse = {
  cursor?: string;
  records: RepoRecord[];
};

export type DescribeRepoResponse = {
  did: string;
  didDoc: unknown;
  handle: string;
  collections: string[];
  handleIsCorrect: boolean;
};

export type ListRecordsOptions = {
  repo: string;
  limit?: number;
  cursor?: string;
  reverse?: boolean;
  collection: string;
};

export async function listRecords(api: ApiClient, options: ListRecordsOptions): Promise<CachedResponse<ListRecordsResponse>> {
  return api.requestWithCache<ListRecordsResponse>(`com.atproto.repo.listRecords:${JSON.stringify(options)}`, {
    path: 'com.atproto.repo.listRecords',
    query: options,
  });
}

export async function describeRepo(api: ApiClient, repo: string): Promise<DescribeRepoResponse> {
  const response = await api.request({
    path: 'com.atproto.repo.describeRepo',
    query: {
      repo,
    },
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as DescribeRepoResponse;
}
