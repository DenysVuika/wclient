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
export declare function listRecords(api: ApiClient, repoDid: string): Promise<CachedResponse<ListRecordsResponse>>;
export declare function describeRepo(api: ApiClient, repo: string): Promise<DescribeRepoResponse>;
//# sourceMappingURL=repo.d.ts.map