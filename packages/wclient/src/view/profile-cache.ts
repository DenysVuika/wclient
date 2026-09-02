import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import type { ActorProfile } from '../api/actor.js';
import type { RepoStatus, RepoSummary } from '../api/sync.js';

export type ProfileCacheEntry = {
  pds: string;
  did: string;
  profile: ActorProfile;
  cachedAt: number;
};

export type RepoStateCacheEntry = {
  pds: string;
  did: string;
  active?: boolean;
  head?: string;
  rev?: string;
  status?: RepoStatus;
  cachedAt: number;
};

export type ProfileCacheLookup = {
  profile: ActorProfile | null;
  repoState: RepoStateCacheEntry | null;
};

const CACHE_FILE = '.wclient-profile-cache.sqlite';
const DEFAULT_CACHE_SCOPE = 'default';

let database: { path: string; connection: DatabaseSync } | null = null;

function getCachePath(): string {
  return join(process.cwd(), CACHE_FILE);
}

function normalizeCacheScope(pds?: string): string {
  const value = pds?.trim();
  if (!value) {
    return DEFAULT_CACHE_SCOPE;
  }

  try {
    const url = new URL(value);
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString().replace(/\/$/, '');
  } catch {
    return value;
  }
}

function createProfilesTable(connection: DatabaseSync): void {
  connection.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      pds TEXT NOT NULL,
      did TEXT NOT NULL,
      profile_json TEXT NOT NULL CHECK (json_valid(profile_json)),
      cached_at INTEGER NOT NULL,
      PRIMARY KEY (pds, did)
    );
  `);
}

function createRepoStatesTable(connection: DatabaseSync): void {
  connection.exec(`
    CREATE TABLE IF NOT EXISTS repo_states (
      pds TEXT NOT NULL,
      did TEXT NOT NULL,
      active INTEGER,
      head TEXT,
      rev TEXT,
      status TEXT,
      cached_at INTEGER NOT NULL,
      PRIMARY KEY (pds, did)
    );
  `);
}

function ensureSchema(connection: DatabaseSync): void {
  const table = connection.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'profiles'").get();

  if (table === undefined) {
    createProfilesTable(connection);
  } else {
    const columns = connection.prepare('PRAGMA table_info(profiles)').all() as Array<{ name: string }>;
    const hasPdsColumn = columns.some((column) => column.name === 'pds');

    if (!hasPdsColumn) {
      connection.exec('DROP TABLE IF EXISTS profiles_legacy');
      connection.exec('BEGIN');
      try {
        connection.exec('ALTER TABLE profiles RENAME TO profiles_legacy');
        createProfilesTable(connection);
        connection
          .prepare(
            `INSERT OR REPLACE INTO profiles (pds, did, profile_json, cached_at)
             SELECT ?, did, profile_json, cached_at FROM profiles_legacy`
          )
          .run(DEFAULT_CACHE_SCOPE);
        connection.exec('DROP TABLE profiles_legacy');
        connection.exec('COMMIT');
      } catch (error) {
        connection.exec('ROLLBACK');
        throw error;
      }
    }
  }

  connection.exec(`
    CREATE INDEX IF NOT EXISTS profiles_pds_account_type_idx
      ON profiles (pds, json_extract(profile_json, '$.wsocialAccountType'));

    CREATE INDEX IF NOT EXISTS profiles_pds_verified_idx
      ON profiles (pds, json_extract(profile_json, '$.wsocialVerified'));
  `);

  createRepoStatesTable(connection);
  const repoStateColumns = connection.prepare('PRAGMA table_info(repo_states)').all() as Array<{ name: string }>;
  if (!repoStateColumns.some((column) => column.name === 'head')) {
    connection.exec('ALTER TABLE repo_states ADD COLUMN head TEXT');
  }
  if (!repoStateColumns.some((column) => column.name === 'rev')) {
    connection.exec('ALTER TABLE repo_states ADD COLUMN rev TEXT');
  }

  connection.exec(`
    CREATE INDEX IF NOT EXISTS repo_states_pds_active_idx
      ON repo_states (pds, active);

    CREATE INDEX IF NOT EXISTS repo_states_pds_status_idx
      ON repo_states (pds, status);
  `);
}

function getDatabase(): DatabaseSync {
  const cachePath = getCachePath();
  if (database?.path === cachePath) {
    return database.connection;
  }

  if (database !== null) {
    database.connection.close();
  }

  const connection = new DatabaseSync(cachePath);
  ensureSchema(connection);

  database = { path: cachePath, connection };
  return connection;
}

export function getProfileFromCache(did: string, pds?: string): ActorProfile | null {
  const row = getDatabase()
    .prepare('SELECT profile_json FROM profiles WHERE pds = ? AND did = ?')
    .get(normalizeCacheScope(pds), did) as { profile_json: string } | undefined;

  return row === undefined ? null : (JSON.parse(row.profile_json) as ActorProfile);
}

export function getProfilesWithRepoStates(dids: string[], pds?: string): Map<string, ProfileCacheLookup> {
  if (dids.length === 0) {
    return new Map();
  }

  const scope = normalizeCacheScope(pds);
  const rows = getDatabase()
    .prepare(
      `SELECT
        requested.did,
        profiles.profile_json,
        repo_states.active,
        repo_states.head,
        repo_states.rev,
        repo_states.status,
        repo_states.cached_at
       FROM (SELECT value AS did FROM json_each(?)) AS requested
       LEFT JOIN profiles ON profiles.pds = ? AND profiles.did = requested.did
       LEFT JOIN repo_states ON repo_states.pds = ? AND repo_states.did = requested.did`
    )
    .all(JSON.stringify(dids), scope, scope) as Array<{
    did: string;
    profile_json: string | null;
    active: number | null;
    head: string | null;
    rev: string | null;
    status: RepoStatus | null;
    cached_at: number | null;
  }>;

  return new Map(
    rows.map((row) => [
      row.did,
      {
        profile: row.profile_json === null ? null : (JSON.parse(row.profile_json) as ActorProfile),
        repoState:
          row.cached_at === null
            ? null
            : {
                pds: scope,
                did: row.did,
                ...(row.active !== null ? { active: row.active === 1 } : {}),
                ...(row.head !== null ? { head: row.head } : {}),
                ...(row.rev !== null ? { rev: row.rev } : {}),
                ...(row.status !== null ? { status: row.status } : {}),
                cachedAt: row.cached_at,
              },
      } satisfies ProfileCacheLookup,
    ])
  );
}

export function saveProfileToCache(did: string, profile: ActorProfile, pds?: string): void {
  getDatabase()
    .prepare(
      `INSERT INTO profiles (pds, did, profile_json, cached_at)
       VALUES (?, ?, json(?), ?)
       ON CONFLICT(pds, did) DO UPDATE SET
         profile_json = excluded.profile_json,
         cached_at = excluded.cached_at`
    )
    .run(normalizeCacheScope(pds), did, JSON.stringify(profile), Date.now());
}

export function getRepoStateFromCache(did: string, pds?: string): RepoStateCacheEntry | null {
  const row = getDatabase()
    .prepare('SELECT active, head, rev, status, cached_at FROM repo_states WHERE pds = ? AND did = ?')
    .get(normalizeCacheScope(pds), did) as
    | { active: number | null; head: string | null; rev: string | null; status: RepoStatus | null; cached_at: number }
    | undefined;

  if (row === undefined) {
    return null;
  }

  return {
    pds: normalizeCacheScope(pds),
    did,
    ...(row.active !== null ? { active: row.active === 1 } : {}),
    ...(row.head !== null ? { head: row.head } : {}),
    ...(row.rev !== null ? { rev: row.rev } : {}),
    ...(row.status !== null ? { status: row.status } : {}),
    cachedAt: row.cached_at,
  };
}

export function saveRepoStateToCache(
  did: string,
  state: { active?: boolean; head?: string; rev?: string; status?: RepoStatus },
  pds?: string
): void {
  getDatabase()
    .prepare(
      `INSERT INTO repo_states (pds, did, active, head, rev, status, cached_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(pds, did) DO UPDATE SET
         active = excluded.active,
         head = excluded.head,
         rev = excluded.rev,
         status = excluded.status,
         cached_at = excluded.cached_at`
    )
    .run(
      normalizeCacheScope(pds),
      did,
      state.active === undefined ? null : state.active ? 1 : 0,
      state.head ?? null,
      state.rev ?? null,
      state.status ?? null,
      Date.now()
    );
}

export function saveRepoStatesToCache(repos: RepoSummary[], pds?: string): void {
  if (repos.length === 0) {
    return;
  }

  const statement = getDatabase().prepare(
    `INSERT INTO repo_states (pds, did, active, head, rev, status, cached_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(pds, did) DO UPDATE SET
       active = excluded.active,
       head = excluded.head,
       rev = excluded.rev,
       status = excluded.status,
       cached_at = excluded.cached_at`
  );
  const scope = normalizeCacheScope(pds);
  const cachedAt = Date.now();

  getDatabase().exec('BEGIN');
  try {
    for (const repo of repos) {
      statement.run(
        scope,
        repo.did,
        repo.active === undefined ? null : repo.active ? 1 : 0,
        repo.head,
        repo.rev,
        repo.status ?? null,
        cachedAt
      );
    }
    getDatabase().exec('COMMIT');
  } catch (error) {
    getDatabase().exec('ROLLBACK');
    throw error;
  }
}

export function flushProfileCache(): void {
  // SQLite writes are committed immediately; kept for the existing call sites.
}

export function clearProfileCache(pds?: string): void {
  if (pds === undefined) {
    getDatabase().prepare('DELETE FROM profiles').run();
    getDatabase().prepare('DELETE FROM repo_states').run();
    return;
  }

  getDatabase().prepare('DELETE FROM profiles WHERE pds = ?').run(normalizeCacheScope(pds));
  getDatabase().prepare('DELETE FROM repo_states WHERE pds = ?').run(normalizeCacheScope(pds));
}

export function getCacheSize(pds?: string): number {
  const row =
    pds === undefined
      ? getDatabase().prepare('SELECT COUNT(*) AS count FROM profiles').get()
      : getDatabase().prepare('SELECT COUNT(*) AS count FROM profiles WHERE pds = ?').get(normalizeCacheScope(pds));

  return (
    row as {
      count: number;
    }
  ).count;
}
