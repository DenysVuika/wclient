import type { WClient } from '../wclient.js';
import {
  formatNumber,
  formatReportDate,
  renderAsciiTable,
} from '../utils/table.js';

export type PdsUsersReport = {
  users: number;
  activeUsers: number;
  inactiveUsers: number;
};

export type PdsUsersReportProgress = {
  pagesFetched: number;
  usersSoFar: number;
};

export type GetPdsUsersReportOptions = {
  onProgress?: (progress: PdsUsersReportProgress) => void;
};

export async function getPdsUsersReport(client: WClient, options?: GetPdsUsersReportOptions): Promise<PdsUsersReport> {
  let cursor: string | undefined;
  let users = 0;
  let activeUsers = 0;
  let pagesFetched = 0;

  do {
    const response = await client.sync.listRepos(cursor !== undefined ? { cursor } : undefined);
    const repos = response.data.repos;

    users += repos.length;
    activeUsers += repos.filter((repo) => repo.active === true).length;
    pagesFetched += 1;
    options?.onProgress?.({
      pagesFetched,
      usersSoFar: users,
    });

    cursor = response.data.cursor;
  } while (cursor !== undefined);

  return {
    users,
    activeUsers,
    inactiveUsers: users - activeUsers,
  };
}

export function renderPdsUsersReportTable(report: PdsUsersReport, date: Date = new Date()): string {
  const rows: string[][] = [
    ['Active users', formatNumber(report.activeUsers)],
    ['Inactive users', formatNumber(report.inactiveUsers)],
    ['Total users', formatNumber(report.users)],
  ];

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
