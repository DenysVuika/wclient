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
  /**
   * The handle or DID of the repo.
   */
  repo: string;
  /**
   * Maximum number of records to return.
   */
  limit?: number;
  /**
   * Cursor returned from a previous page of results.
   */
  cursor?: string;
  /**
   * Reverse the order of the returned records.
   */
  reverse?: boolean;
  /**
   * The NSID of the record type.
   */
  collection: string;
};

export async function listRecords(
  api: ApiClient,
  options: ListRecordsOptions,
): Promise<CachedResponse<ListRecordsResponse>> {
  return api.requestWithCache<ListRecordsResponse>(
    `com.atproto.repo.listRecords:${JSON.stringify(options)}`,
    {
      path: 'com.atproto.repo.listRecords',
      query: options,
    },
  );
}

/**
 * Get information about an account and repository, including the list of collections.
 * Does not require auth.
 *
 * @param repo The handle or DID of the repo.
 */
export async function describeRepo(
  api: ApiClient,
  repo: string,
): Promise<DescribeRepoResponse> {
  const response = await api.request({
    path: 'com.atproto.repo.describeRepo',
    query: {
      repo,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Request failed: ${response.status} ${response.statusText}`,
    );
  }

  return (await response.json()) as DescribeRepoResponse;
}
