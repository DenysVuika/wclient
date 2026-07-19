import { mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Session } from './types';

export type AuthSessionStore = {
  get: () => Session | null;
  set: (session: Session) => void;
  clear: () => void;
};

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

export function createInMemoryAuthSessionStore(initialSession: Session | null = null): AuthSessionStore {
  let session = initialSession;

  return {
    get: () => session,
    set: (nextSession: Session) => {
      session = nextSession;
    },
    clear: () => {
      session = null;
    },
  };
}

export function createFileAuthSessionStore(filePath: string): AuthSessionStore {
  mkdirSync(dirname(filePath), { recursive: true });

  let session: Session | null = null;

  try {
    const raw = readFileSync(filePath, 'utf8');
    session = JSON.parse(raw) as Session;
    debugAuth(`Restored auth session from ${filePath}: ${describeSession(session)}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }

    debugAuth(`No auth session file found at ${filePath}.`);
  }

  return {
    get: () => session,
    set: (nextSession: Session) => {
      session = nextSession;
      writeFileSync(filePath, `${JSON.stringify(nextSession, null, 2)}\n`, {
        mode: 0o600,
      });
      debugAuth(`Stored auth session to ${filePath}: ${describeSession(nextSession)}`);
    },
    clear: () => {
      const previousSession = session;
      session = null;

      try {
        unlinkSync(filePath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
      }

      debugAuth(`Cleared auth session from ${filePath}: ${describeSession(previousSession)}`);
    },
  };
}
