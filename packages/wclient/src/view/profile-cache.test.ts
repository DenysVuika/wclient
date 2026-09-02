import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ActorProfile } from '../api/actor.js';
import {
  clearProfileCache,
  flushProfileCache,
  getCacheSize,
  getProfileFromCache,
  getProfilesWithRepoStates,
  getRepoStateFromCache,
  saveProfileToCache,
  saveRepoStateToCache,
} from './profile-cache.js';

const originalCwd = process.cwd();
let cacheDir: string;

function profile(overrides: Partial<ActorProfile> = {}): ActorProfile {
  return {
    did: 'did:plc:alice',
    handle: 'alice.test',
    displayName: 'Alice',
    wsocialAccountType: 'human',
    wsocialVerified: 'wid',
    ...overrides,
  };
}

describe('profile cache', () => {
  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), 'wclient-profile-cache-'));
    process.chdir(cacheDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(cacheDir, { force: true, recursive: true });
  });

  it('stores and loads profiles by DID', () => {
    const cachedProfile = profile();

    expect(getProfileFromCache(cachedProfile.did)).toBeNull();

    saveProfileToCache(cachedProfile.did, cachedProfile);
    flushProfileCache();

    expect(getProfileFromCache(cachedProfile.did)).toEqual(cachedProfile);
    expect(getCacheSize()).toBe(1);
  });

  it('updates existing profile rows', () => {
    saveProfileToCache('did:plc:alice', profile());
    saveProfileToCache('did:plc:alice', profile({ displayName: 'Alice Updated', wsocialAccountType: 'bot' }));

    expect(getProfileFromCache('did:plc:alice')).toMatchObject({
      displayName: 'Alice Updated',
      wsocialAccountType: 'bot',
    });
    expect(getCacheSize()).toBe(1);
  });

  it('scopes cached profiles by PDS', () => {
    saveProfileToCache('did:plc:alice', profile({ displayName: 'Alice on PDS A' }), 'https://pds-a.test');
    saveProfileToCache('did:plc:alice', profile({ displayName: 'Alice on PDS B' }), 'https://pds-b.test');

    expect(getProfileFromCache('did:plc:alice', 'https://pds-a.test')).toMatchObject({
      displayName: 'Alice on PDS A',
    });
    expect(getProfileFromCache('did:plc:alice', 'https://pds-b.test')).toMatchObject({
      displayName: 'Alice on PDS B',
    });
    expect(getCacheSize()).toBe(2);
    expect(getCacheSize('https://pds-a.test')).toBe(1);
  });

  it('supports SQLite JSON queries over cached profile data', () => {
    saveProfileToCache('did:plc:alice', profile(), 'https://pds-a.test');
    saveProfileToCache(
      'did:plc:bot',
      profile({
        did: 'did:plc:bot',
        handle: 'bot.test',
        wsocialAccountType: 'bot',
      }),
      'https://pds-b.test'
    );

    const db = new DatabaseSync(join(cacheDir, '.wclient-profile-cache.sqlite'));
    const row = db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM profiles
         WHERE pds = 'https://pds-a.test'
           AND json_extract(profile_json, '$.wsocialAccountType') = 'human'`
      )
      .get() as { count: number };
    db.close();

    expect(row.count).toBe(1);
  });

  it('stores and loads repo state by PDS and DID', () => {
    saveRepoStateToCache(
      'did:plc:alice',
      {
        active: false,
        head: 'bafyreiatuua7ppb3rjvyonhaddiditxgnmerar3nxnejkqggpqpd7cyyjq',
        rev: '3mdfx2s3cpk2b',
        status: 'deactivated',
      },
      'https://pds.test'
    );

    expect(getRepoStateFromCache('did:plc:alice', 'https://pds.test')).toMatchObject({
      active: false,
      did: 'did:plc:alice',
      head: 'bafyreiatuua7ppb3rjvyonhaddiditxgnmerar3nxnejkqggpqpd7cyyjq',
      pds: 'https://pds.test',
      rev: '3mdfx2s3cpk2b',
      status: 'deactivated',
    });
    expect(getRepoStateFromCache('did:plc:alice', 'https://other-pds.test')).toBeNull();
  });

  it('loads profiles and repo states together for a PDS page', () => {
    saveProfileToCache('did:plc:alice', profile(), 'https://pds.test');
    saveRepoStateToCache('did:plc:alice', { active: true, head: 'head', rev: 'rev' }, 'https://pds.test');

    const entries = getProfilesWithRepoStates(['did:plc:alice', 'did:plc:missing'], 'https://pds.test');

    expect(entries.get('did:plc:alice')).toMatchObject({
      profile: { handle: 'alice.test' },
      repoState: { active: true, head: 'head', rev: 'rev' },
    });
    expect(entries.get('did:plc:missing')).toEqual({
      profile: null,
      repoState: null,
    });
  });

  it('adds head and rev columns to existing repo state caches', () => {
    const db = new DatabaseSync(join(cacheDir, '.wclient-profile-cache.sqlite'));
    db.exec(`
      CREATE TABLE repo_states (
        pds TEXT NOT NULL,
        did TEXT NOT NULL,
        active INTEGER,
        status TEXT,
        cached_at INTEGER NOT NULL,
        PRIMARY KEY (pds, did)
      );
    `);
    db.close();

    saveRepoStateToCache('did:plc:alice', { active: true, head: 'head', rev: 'rev' }, 'https://pds.test');

    expect(getRepoStateFromCache('did:plc:alice', 'https://pds.test')).toMatchObject({
      active: true,
      head: 'head',
      rev: 'rev',
    });
  });

  it('clears cached repo states with the profile cache', () => {
    saveRepoStateToCache('did:plc:alice', { active: true }, 'https://pds.test');

    clearProfileCache();

    expect(getRepoStateFromCache('did:plc:alice', 'https://pds.test')).toBeNull();
  });

  it('clears cached profiles', () => {
    saveProfileToCache('did:plc:alice', profile());

    clearProfileCache();

    expect(getCacheSize()).toBe(0);
    expect(getProfileFromCache('did:plc:alice')).toBeNull();
  });
});
