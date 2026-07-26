import type { WClient } from '../wclient.js';
import { getProfile } from '../api/actor.js';
import { formatNumber, formatReportDate, renderAsciiTable } from '../utils/table.js';

export type PdsUsersReport = {
  users: number;
  activeUsers: number;
  inactiveUsers: number;
  humanUsers?: number;
  botUsers?: number;
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
};

export async function getPdsUsersReport(client: WClient, options?: GetPdsUsersReportOptions): Promise<PdsUsersReport> {
  let cursor: string | undefined;
  let users = 0;
  let activeUsers = 0;
  let humanUsers = 0;
  let botUsers = 0;
  let verifiedByWid = 0;
  let verifiedByAdmin = 0;
  let pagesFetched = 0;
  let profilesFetched = 0;
  let hasProfileData = false;

  do {
    const response = await client.sync.listRepos(cursor !== undefined ? { cursor } : undefined);
    const repos = response.data.repos;

    users += repos.length;
    activeUsers += repos.filter((repo) => repo.active === true).length;

    // Fetch profiles if withProfiles is enabled
    if (options?.withProfiles) {
      for (const repo of repos) {
        try {
          const profile = await getProfile(client.apiClient, repo.did);
          hasProfileData = true;
          profilesFetched++;

          if (profile.wsocialAccountType === 'human') {
            humanUsers++;
          } else if (profile.wsocialAccountType === 'bot') {
            botUsers++;
          }

          if (profile.wsocialVerified === 'wid') {
            verifiedByWid++;
          } else if (profile.wsocialVerified === 'admin') {
            verifiedByAdmin++;
          }

          // Report progress after each profile fetch
          options?.onProgress?.(
            {
              pagesFetched,
              usersSoFar: users,
              profilesFetched,
            },
          );
        } catch {
          // Skip profiles that fail to load
        }
      }
    } else {
      pagesFetched += 1;
      options?.onProgress?.({
        pagesFetched,
        usersSoFar: users,
      });
    }

    cursor = response.data.cursor;
  } while (cursor !== undefined);

  const report: PdsUsersReport = {
    users,
    activeUsers,
    inactiveUsers: users - activeUsers,
  };

  // Only include profile-based metrics if we actually fetched profiles
  if (hasProfileData) {
    report.humanUsers = humanUsers;
    report.botUsers = botUsers;
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
