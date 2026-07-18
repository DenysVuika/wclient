import type { Session } from './types';
export type AuthSessionStore = {
    get: () => Session | null;
    set: (session: Session) => void;
    clear: () => void;
};
export declare function createInMemoryAuthSessionStore(initialSession?: Session | null): AuthSessionStore;
export declare function createFileAuthSessionStore(filePath: string): AuthSessionStore;
//# sourceMappingURL=store.d.ts.map