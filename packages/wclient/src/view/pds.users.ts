import type { WClient } from '../wclient.js';
import { getProfile } from '../api/actor.js';
import type { RepoStatus } from '../api/sync.js';
import type { RepoSummary } from '../api/sync.js';
import { formatNumber, formatReportDate, renderAsciiTable } from '../utils/table.js';
import {
  flushProfileCache,
  getCacheSize,
  getProfilesWithRepoStates,
  saveProfileToCache,
  saveRepoStatesToCache,
  type RepoStateCacheEntry,
} from './profile-cache.js';

const DEFAULT_PROFILE_FETCH_CONCURRENCY = 8;

export type PdsUsersReport = {
  users: number;
  activeUsers: number;
  inactiveUsers: number;
  humanUsers?: number;
  botUsers?: number;
  unverifiedUsers?: number;
  verifiedByWid?: number;
  verifiedByAdmin?: number;
};

export type PdsUsersReportProgress = {
  pagesFetched: number;
  usersSoFar: number;
  profilesFetched?: number;
};

export type GetPdsUsersReportOptions = {
  onProgress?: (progress: PdsUsersReportProgress) => void;
  withProfiles?: boolean;
  profileFetchConcurrency?: number;
  profileCachePds?: string;
};

export type PdsProfileCacheSyncProgress = {
  activeUsers: number;
  inactiveUsers: number;
  pagesFetched: number;
  usersSeen: number;
  profilesChecked: number;
  cacheHits: number;
  profilesFetched: number;
  profilesFailed: number;
};

export type PdsProfileCacheSyncFailure = {
  active?: boolean;
  did: string;
  error: string;
  status?: RepoStatus;
};

export type PdsProfileCacheSyncResult = PdsProfileCacheSyncProgress & {
  cacheSize: number;
  elapsedMs: number;
  failedProfiles: PdsProfileCacheSyncFailure[];
  pds: string;
};

export type SyncPdsProfileCacheOptions = {
  onProgress?: (progress: PdsProfileCacheSyncProgress) => void;
  profileFetchConcurrency?: number;
  profileCachePds?: string;
  refreshProfiles?: boolean;
};

const MAX_PROFILE_SYNC_FAILURES = 10;

async function mapWithConcurrency<Item, Result>(
  items: Item[],
  concurrency: number,
  mapper: (item: Item) => Promise<Result>
): Promise<Result[]> {
  const results = new Array<Result>(items.length);
  let nextIndex = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index] as Item);
    }
  });

  await Promise.all(workers);
  return results;
}

function getProfileFetchConcurrency(options?: { profileFetchConcurrency?: number }): number {
  const value = options?.profileFetchConcurrency ?? DEFAULT_PROFILE_FETCH_CONCURRENCY;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error('profileFetchConcurrency must be a positive integer.');
  }
  return value;
}

function hasRepoChanged(cachedState: RepoStateCacheEntry | null, repo: RepoSummary): boolean {
  if (cachedState === null) {
    return false;
  }

  return (
    (cachedState.head !== undefined && cachedState.head !== repo.head) ||
    (cachedState.rev !== undefined && cachedState.rev !== repo.rev)
  );
}

export async function syncPdsProfileCache(
  client: WClient,
  options?: SyncPdsProfileCacheOptions
): Promise<PdsProfileCacheSyncResult> {
  const startedAt = Date.now();
  const profileFetchConcurrency = getProfileFetchConcurrency(options);
  const profileCachePds = options?.profileCachePds ?? client.getBaseUrl();
  const progress: PdsProfileCacheSyncProgress = {
    activeUsers: 0,
    inactiveUsers: 0,
    pagesFetched: 0,
    usersSeen: 0,
    profilesChecked: 0,
    cacheHits: 0,
    profilesFetched: 0,
    profilesFailed: 0,
  };
  let cursor: string | undefined;
  const failedProfiles: PdsProfileCacheSyncFailure[] = [];

  function reportProgress(): void {
    options?.onProgress?.({ ...progress });
  }

  do {
    const response = await client.sync.listRepos(cursor !== undefined ? { cursor } : undefined);
    const repos = response.data.repos;
    progress.pagesFetched += 1;
    progress.usersSeen += repos.length;
    progress.activeUsers += repos.filter((repo) => repo.active === true).length;
    progress.inactiveUsers += repos.filter((repo) => repo.active === false).length;
    reportProgress();
    const cacheEntries = getProfilesWithRepoStates(
      repos.map((repo) => repo.did),
      profileCachePds
    );

    await mapWithConcurrency(repos, profileFetchConcurrency, async (repo) => {
      const cacheEntry = cacheEntries.get(repo.did);
      try {
        const cachedProfile = cacheEntry?.profile ?? null;

        if (
          !options?.refreshProfiles &&
          cachedProfile !== null &&
          !hasRepoChanged(cacheEntry?.repoState ?? null, repo)
        ) {
          progress.cacheHits += 1;
          progress.profilesChecked += 1;
          reportProgress();
          return;
        }

        const profile = await getProfile(client.apiClient, repo.did);
        saveProfileToCache(repo.did, profile, profileCachePds);
        progress.profilesFetched += 1;
      } catch (error) {
        progress.profilesFailed += 1;
        if (failedProfiles.length < MAX_PROFILE_SYNC_FAILURES) {
          failedProfiles.push({
            ...(repo.active !== undefined ? { active: repo.active } : {}),
            did: repo.did,
            error: error instanceof Error ? error.message : String(error),
            ...(repo.status !== undefined ? { status: repo.status } : {}),
          });
        }
      }

      progress.profilesChecked += 1;
      reportProgress();
    });

    saveRepoStatesToCache(repos, profileCachePds);

    cursor = response.data.cursor;
  } while (cursor !== undefined);

  flushProfileCache();

  return {
    ...progress,
    cacheSize: getCacheSize(profileCachePds),
    elapsedMs: Date.now() - startedAt,
    failedProfiles,
    pds: profileCachePds,
  };
}

export async function getPdsUsersReport(client: WClient, options?: GetPdsUsersReportOptions): Promise<PdsUsersReport> {
  let cursor: string | undefined;
  let users = 0;
  let activeUsers = 0;
  let humanUsers = 0;
  let botUsers = 0;
  let unverifiedUsers = 0;
  let verifiedByWid = 0;
  let verifiedByAdmin = 0;
  let pagesFetched = 0;
  let profilesFetched = 0;
  let hasProfileData = false;
  const profileFetchConcurrency = getProfileFetchConcurrency(options);
  const profileCachePds = options?.profileCachePds ?? client.getBaseUrl();

  do {
    const response = await client.sync.listRepos(cursor !== undefined ? { cursor } : undefined);
    const repos = response.data.repos;

    users += repos.length;
    activeUsers += repos.filter((repo) => repo.active === true).length;
    const cacheEntries = options?.withProfiles
      ? getProfilesWithRepoStates(
          repos.map((repo) => repo.did),
          profileCachePds
        )
      : undefined;

    // Fetch profiles if withProfiles is enabled
    if (options?.withProfiles) {
      pagesFetched += 1;
      const profiles = await mapWithConcurrency(repos, profileFetchConcurrency, async (repo) => {
        const cacheEntry = cacheEntries?.get(repo.did);
        try {
          let profile = cacheEntry?.profile ?? null;
          if (!profile || hasRepoChanged(cacheEntry?.repoState ?? null, repo)) {
            profile = await getProfile(client.apiClient, repo.did);
            saveProfileToCache(repo.did, profile, profileCachePds);
          }
          return profile;
        } catch {
          return null;
        }
      });

      saveRepoStatesToCache(repos, profileCachePds);

      for (const profile of profiles) {
        if (profile !== null) {
          hasProfileData = true;
          profilesFetched++;

          if (profile.wsocialAccountType === 'human') {
            humanUsers++;
          } else if (profile.wsocialAccountType === 'bot') {
            botUsers++;
          } else if (profile.wsocialAccountType === 'unverified') {
            unverifiedUsers++;
          }

          if (profile.wsocialVerified === 'wid') {
            verifiedByWid++;
          } else if (profile.wsocialVerified === 'admin') {
            verifiedByAdmin++;
          }

          // Report progress after each profile fetch
          options?.onProgress?.({
            pagesFetched,
            usersSoFar: users,
            profilesFetched,
          });
        }
      }
    } else {
      saveRepoStatesToCache(repos, profileCachePds);
      pagesFetched += 1;
      options?.onProgress?.({
        pagesFetched,
        usersSoFar: users,
      });
    }

    cursor = response.data.cursor;
  } while (cursor !== undefined);

  // Persist any newly fetched profiles to disk in one write
  flushProfileCache();

  const report: PdsUsersReport = {
    users,
    activeUsers,
    inactiveUsers: users - activeUsers,
  };

  // Only include profile-based metrics if we actually fetched profiles
  if (hasProfileData) {
    report.humanUsers = humanUsers;
    report.botUsers = botUsers;
    report.unverifiedUsers = unverifiedUsers;
    report.verifiedByWid = verifiedByWid;
    report.verifiedByAdmin = verifiedByAdmin;
  }

  return report;
}

export function renderPdsUsersReportTable(report: PdsUsersReport, date: Date = new Date()): string {
  const rows: string[][] = [
    ['Active users', formatNumber(report.activeUsers)],
    ['Inactive users', formatNumber(report.inactiveUsers)],
    ['Total users', formatNumber(report.users)],
  ];

  // Add profile-based metrics if available
  if (report.humanUsers !== undefined) {
    rows.push(['Human users', formatNumber(report.humanUsers)]);
  }
  if (report.botUsers !== undefined) {
    rows.push(['Bot users', formatNumber(report.botUsers)]);
  }
  if (report.unverifiedUsers !== undefined) {
    rows.push(['Unverified users', formatNumber(report.unverifiedUsers)]);
  }
  if (report.verifiedByWid !== undefined) {
    rows.push(['Verified by WID', formatNumber(report.verifiedByWid)]);
  }
  if (report.verifiedByAdmin !== undefined) {
    rows.push(['Verified by Admin', formatNumber(report.verifiedByAdmin)]);
  }

  return [
    `PDS Users: ${formatReportDate(date)}`,
    renderAsciiTable({
      headers: ['Metric', 'Value'],
      rows,
      alignments: ['left', 'right'],
    }),
  ].join('\n');
}

export async function buildPdsUsersReportTable(client: WClient): Promise<string> {
  const report = await getPdsUsersReport(client);
  return renderPdsUsersReportTable(report);
}
