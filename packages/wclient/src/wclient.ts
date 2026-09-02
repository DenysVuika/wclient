import {
  getProfile,
  describeRepo,
  listRecords,
  listRepos,
  type ActorService,
  type ListReposOptions,
  type ListRecordsOptions,
  type RepoService,
  type SyncService,
} from './api';
import {
  createAuth,
  createInMemoryAuthSessionStore,
  type AuthClient,
  type AuthSessionStore,
  type LoginOptions,
  type Session,
} from './auth';
import { createApiClient, type ApiClient } from './http/client';

type BaseUrlOption = string | (() => string);

export type WClientOptions = {
  baseUrl?: BaseUrlOption;
  authStore?: AuthSessionStore;
};

export const DEFAULT_PDS_URL = 'https://pds.wsocial.network';

export class WClient {
  readonly auth: AuthClient;
  readonly apiClient: ApiClient;
  readonly actor: ActorService;
  readonly repo: RepoService;
  readonly sync: SyncService;
  private readonly resolveBaseUrl: () => string;

  constructor({ baseUrl, authStore = createInMemoryAuthSessionStore() }: WClientOptions = {}) {
    this.resolveBaseUrl = typeof baseUrl === 'function' ? baseUrl : () => baseUrl ?? DEFAULT_PDS_URL;
    const authApiClient = createApiClient(this.resolveBaseUrl);

    this.auth = createAuth(authApiClient, authStore);
    this.apiClient = createApiClient(this.resolveBaseUrl, this.auth);
    this.actor = {
      getProfile: (actor: string) => getProfile(this.apiClient, actor),
    };
    this.repo = {
      describeRepo: (repo: string) => describeRepo(this.apiClient, repo),
      listRecords: (options: ListRecordsOptions) => listRecords(this.apiClient, options),
    };
    this.sync = {
      listRepos: (options?: ListReposOptions) => listRepos(this.apiClient, options),
    };
  }

  login(options: LoginOptions): Promise<Session | null> {
    return this.auth.login(options);
  }

  getSession(): Session | null {
    return this.auth.getSession();
  }

  getBaseUrl(): string {
    return this.resolveBaseUrl();
  }

  clearSession(): void {
    this.auth.clear();
  }
}
