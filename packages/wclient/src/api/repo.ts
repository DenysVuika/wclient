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
   * The number of records to return. Min: 1, Max: 100. Default: 50.
   */
  limit?: number;
  /**
   * Cursor returned from a previous page of results.
   */
  cursor?: string;
  /**
   * Flag to reverse the order of the returned records.
   */
  reverse?: boolean;
  /**
   * The NSID of the record type.
   */
  collection: string;
};

export type RepoService = {
  /**
   * Get information about an account and repository, including the list of collections.
   * Does not require auth.
   *
   * @param repo The handle or DID of the repo.
   */
  describeRepo: (repo: string) => Promise<DescribeRepoResponse>;
  /**
   * List a range of records in a repository, matching a specific collection.
   * Does not require auth.
   *
   * @param options Query parameters for listing records.
   */
  listRecords: (
    options: ListRecordsOptions,
  ) => Promise<CachedResponse<ListRecordsResponse>>;
};

/**
 * List a range of records in a repository, matching a specific collection.
 * Does not require auth.
 *
 * Query parameters:
 * - repo (string, format: at-identifier, required): The handle or DID of the repo.
 * - limit (integer, min: 1, max: 100, default: 50): The number of records to return.
 * - cursor (string): Cursor returned from a previous page of results.
 * - reverse (boolean): Flag to reverse the order of the returned records.
 * - collection (string, format: nsid, required): The NSID of the record type.
 */
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
