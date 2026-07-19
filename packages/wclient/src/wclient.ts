import {
  describeRepo,
  listRecords,
  listRepos,
  type DescribeRepoResponse,
  type ListRecordsOptions,
  type ListRecordsResponse,
  type ListReposResponse,
} from './api';
import {
  createAuth,
  createInMemoryAuthSessionStore,
  type AuthClient,
  type AuthSessionStore,
  type LoginOptions,
  type Session,
} from './auth';
import { type CachedResponse } from './http';
import { createApiClient, type ApiClient } from './http/client';

type BaseUrlOption = string | (() => string);

export type WClientOptions = {
  baseUrl?: BaseUrlOption;
  authStore?: AuthSessionStore;
};

export const DEFAULT_PDS_URL = 'https://pds.wsocial.network';

function toBaseUrlGetter(baseUrl: BaseUrlOption = DEFAULT_PDS_URL): () => string {
  return typeof baseUrl === 'function' ? baseUrl : () => baseUrl;
}

export type RepoService = {
  describeRepo: (repo: string) => Promise<DescribeRepoResponse>;
  listRecords: (options: ListRecordsOptions) => Promise<CachedResponse<ListRecordsResponse>>;
};

export type SyncService = {
  listRepos: () => Promise<CachedResponse<ListReposResponse>>;
};

export class WClient {
  readonly auth: AuthClient;
  readonly apiClient: ApiClient;
  readonly repo: RepoService;
  readonly sync: SyncService;

  constructor({ baseUrl, authStore = createInMemoryAuthSessionStore() }: WClientOptions = {}) {
    const getBaseUrl = toBaseUrlGetter(baseUrl);
    const authApiClient = createApiClient(getBaseUrl);

    this.auth = createAuth(authApiClient, authStore);
    this.apiClient = createApiClient(getBaseUrl, this.auth);
    this.repo = {
      describeRepo: (repo: string) => describeRepo(this.apiClient, repo),
      listRecords: (options: ListRecordsOptions) => listRecords(this.apiClient, options),
    };
    this.sync = {
      listRepos: () => listRepos(this.apiClient),
    };
  }

  login(options: LoginOptions): Promise<Session | null> {
    return this.auth.login(options);
  }

  getSession(): Session | null {
    return this.auth.getSession();
  }

  clearSession(): void {
    this.auth.clear();
  }
}
