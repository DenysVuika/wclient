import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ActorProfile } from '../api/actor.js';

export type ProfileCacheEntry = {
  did: string;
  profile: ActorProfile;
  cachedAt: number;
};

export type ProfileCache = {
  version: number;
  profiles: Record<string, ProfileCacheEntry>;
};

const CACHE_VERSION = 1;
const CACHE_FILE = '.wclient-profile-cache.json';

function getCachePath(): string {
  return join(process.cwd(), CACHE_FILE);
}

function loadCache(): ProfileCache {
  const cachePath = getCachePath();
  if (!existsSync(cachePath)) {
    return { version: CACHE_VERSION, profiles: {} };
  }

  try {
    const content = readFileSync(cachePath, 'utf-8');
    const cache = JSON.parse(content) as ProfileCache;
    if (cache.version === CACHE_VERSION) {
      return cache;
    }
  } catch {
    // If cache is corrupted, start fresh
  }

  return { version: CACHE_VERSION, profiles: {} };
}

function saveCache(cache: ProfileCache): void {
  const cachePath = getCachePath();
  writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
}

export function getProfileFromCache(did: string): ActorProfile | null {
  const cache = loadCache();
  const entry = cache.profiles[did];
  return entry ? entry.profile : null;
}

export function saveProfileToCache(did: string, profile: ActorProfile): void {
  const cache = loadCache();
  cache.profiles[did] = {
    did,
    profile,
    cachedAt: Date.now(),
  };
  saveCache(cache);
}

export function clearProfileCache(): void {
  const cachePath = getCachePath();
  if (existsSync(cachePath)) {
    const cache: ProfileCache = { version: CACHE_VERSION, profiles: {} };
    saveCache(cache);
  }
}

export function getCacheSize(): number {
  const cache = loadCache();
  return Object.keys(cache.profiles).length;
}
