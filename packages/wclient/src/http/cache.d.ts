export type CachedResponse<T> = {
    fromCache: boolean;
    data: T;
};
export declare function fetchWithEtagCache<T>(key: string, url: string, init: RequestInit, fetchImpl?: typeof fetch): Promise<CachedResponse<T>>;
//# sourceMappingURL=cache.d.ts.map