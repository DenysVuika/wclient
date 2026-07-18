import { type CachedResponse } from './cache';
export type AuthProvider = {
    getAccessToken: () => string | undefined;
    refreshAccessToken: () => Promise<boolean>;
};
type QueryValue = string | number | boolean | null | undefined;
type ApiRequestOptions = {
    path: string;
    method?: string;
    query?: Record<string, QueryValue>;
    headers?: HeadersInit;
    authToken?: string;
    body?: BodyInit | null;
};
export type ApiClient = ReturnType<typeof createApiClient>;
export declare function createApiClient(getBaseUrl: () => string, auth?: AuthProvider): {
    request: (options: ApiRequestOptions) => Promise<Response>;
    requestWithCache: <T>(cacheKey: string, options: ApiRequestOptions) => Promise<CachedResponse<T>>;
};
export {};
//# sourceMappingURL=client.d.ts.map