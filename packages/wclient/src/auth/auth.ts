import type { ApiClient } from '../http/client';
import { createInMemoryAuthSessionStore, type AuthSessionStore } from './store';
import type { LoginOptions, Session } from './types';

function describeSession(session: Session | null): string {
  if (!session) {
    return 'none';
  }

  return `did=${session.did}, handle=${session.handle}, active=${session.active}, emailConfirmed=${session.emailConfirmed}`;
}

function isAuthDebugEnabled(): boolean {
  return process.env.WCLIENT_DEBUG_AUTH === '1' || process.env.WCLIENT_DEBUG_AUTH === 'true';
}

function debugAuth(message: string): void {
  if (isAuthDebugEnabled()) {
    console.debug(message);
  }
}

export type AuthProvider = {
  getAccessToken: () => string | undefined;
  refreshAccessToken: () => Promise<boolean>;
};

export type AuthClient = AuthProvider & {
  login: (options: LoginOptions) => Promise<Session | null>;
  getSession: () => Session | null;
  clear: () => void;
};

export function createAuth(
  api: ApiClient,
  store: AuthSessionStore = createInMemoryAuthSessionStore(),
): AuthClient {
  async function login({ identifier, password }: LoginOptions): Promise<Session | null> {
    const response = await api.request({
      path: 'com.atproto.server.createSession',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        identifier,
        password,
      }),
    });

    if (!response.ok) {
      console.error('Failed to login:', response.statusText);
      return null;
    }

    const session = (await response.json()) as Session;
    store.set(session);
    debugAuth(`Logged in and stored session: ${describeSession(session)}`);
    return session;
  }

  async function refreshAccessToken(): Promise<boolean> {
    const currentSession = store.get();
    if (!currentSession?.refreshJwt) {
      return false;
    }

    const response = await api.request({
      path: 'com.atproto.server.refreshSession',
      method: 'POST',
      authToken: currentSession.refreshJwt,
    });

    if (!response.ok) {
      return false;
    }

    const refreshedSession = (await response.json()) as Session;
    store.set(refreshedSession);
    debugAuth(`Refreshed auth session: ${describeSession(refreshedSession)}`);
    return true;
  }

  function getAccessToken(): string | undefined {
    return store.get()?.accessJwt;
  }

  function getSession(): Session | null {
    return store.get();
  }

  function clear(): void {
    store.clear();
  }

  return {
    login,
    refreshAccessToken,
    getAccessToken,
    getSession,
    clear,
  };
}