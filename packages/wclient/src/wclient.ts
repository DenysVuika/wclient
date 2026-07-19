import {
  describeRepo,
  listRecords,
  listRepos,
  type ListRecordsOptions,
  type ListReposResponse,
  type RepoService,
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

export type SyncService = {
  listRepos: () => Promise<CachedResponse<ListReposResponse>>;
};

export class WClient {
  readonly auth: AuthClient;
  readonly apiClient: ApiClient;
  readonly repo: RepoService;
  readonly sync: SyncService;

  constructor({
    baseUrl,
    authStore = createInMemoryAuthSessionStore(),
  }: WClientOptions = {}) {
    const resolveBaseUrl =
      typeof baseUrl === 'function'
        ? baseUrl
        : () => baseUrl ?? DEFAULT_PDS_URL;
    const authApiClient = createApiClient(resolveBaseUrl);

    this.auth = createAuth(authApiClient, authStore);
    this.apiClient = createApiClient(resolveBaseUrl, this.auth);
    this.repo = {
      describeRepo: (repo: string) => describeRepo(this.apiClient, repo),
      listRecords: (options: ListRecordsOptions) =>
        listRecords(this.apiClient, options),
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
