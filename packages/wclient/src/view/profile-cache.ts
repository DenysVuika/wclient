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

// In-memory cache — loaded once from disk on first access
let memoryCache: ProfileCache | null = null;
let dirty = false;

function getCachePath(): string {
  return join(process.cwd(), CACHE_FILE);
}

function getCache(): ProfileCache {
  if (memoryCache !== null) {
    return memoryCache;
  }

  const cachePath = getCachePath();
  if (existsSync(cachePath)) {
    try {
      const content = readFileSync(cachePath, 'utf-8');
      const cache = JSON.parse(content) as ProfileCache;
      if (cache.version === CACHE_VERSION) {
        memoryCache = cache;
        return memoryCache;
      }
    } catch {
      // If cache is corrupted, start fresh
    }
  }

  memoryCache = { version: CACHE_VERSION, profiles: {} };
  return memoryCache;
}

export function getProfileFromCache(did: string): ActorProfile | null {
  const cache = getCache();
  const entry = cache.profiles[did];
  return entry ? entry.profile : null;
}

export function saveProfileToCache(did: string, profile: ActorProfile): void {
  const cache = getCache();
  cache.profiles[did] = {
    did,
    profile,
    cachedAt: Date.now(),
  };
  dirty = true;
}

export function flushProfileCache(): void {
  if (!dirty || memoryCache === null) return;
  const cachePath = getCachePath();
  writeFileSync(cachePath, JSON.stringify(memoryCache, null, 2), 'utf-8');
  dirty = false;
}

export function clearProfileCache(): void {
  memoryCache = { version: CACHE_VERSION, profiles: {} };
  dirty = false;
  const cachePath = getCachePath();
  writeFileSync(cachePath, JSON.stringify(memoryCache, null, 2), 'utf-8');
}

export function getCacheSize(): number {
  return Object.keys(getCache().profiles).length;
}
