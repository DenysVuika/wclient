import type { ApiClient } from '../http/client';
import { type AuthSessionStore } from './store';
import type { LoginOptions, Session } from './types';
export type AuthProvider = {
    getAccessToken: () => string | undefined;
    refreshAccessToken: () => Promise<boolean>;
};
export type AuthClient = AuthProvider & {
    login: (options: LoginOptions) => Promise<Session | null>;
    getSession: () => Session | null;
    clear: () => void;
};
export declare function createAuth(api: ApiClient, store?: AuthSessionStore): AuthClient;
//# sourceMappingURL=auth.d.ts.map