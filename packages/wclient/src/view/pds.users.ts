import type { WClient } from '../wclient.js';

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

function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

function padRight(value: string, width: number): string {
  return value.padEnd(width, ' ');
}

function padLeft(value: string, width: number): string {
  return value.padStart(width, ' ');
}

function divider(metricWidth: number, valueWidth: number): string {
  return `+${'-'.repeat(metricWidth + 2)}+${'-'.repeat(valueWidth + 2)}+`;
}

function tableRow(metric: string, value: string, metricWidth: number, valueWidth: number): string {
  return `| ${padRight(metric, metricWidth)} | ${padLeft(value, valueWidth)} |`;
}

export function renderPdsUsersReportTable(report: PdsUsersReport): string {
  const rows: Array<[string, string]> = [
    ['Users', formatNumber(report.users)],
    ['Active users', formatNumber(report.activeUsers)],
    ['Inactive users', formatNumber(report.inactiveUsers)],
  ];

  const metricWidth = Math.max('Metric'.length, ...rows.map(([metric]) => metric.length));
  const valueWidth = Math.max('Value'.length, ...rows.map(([, value]) => value.length));
  const line = divider(metricWidth, valueWidth);

  const output = [
    'PDS Users Report',
    line,
    tableRow('Metric', 'Value', metricWidth, valueWidth),
    line,
    ...rows.map(([metric, value]) => tableRow(metric, value, metricWidth, valueWidth)),
    line,
  ];

  return output.join('\n');
}

export async function buildPdsUsersReportTable(client: WClient): Promise<string> {
  const report = await getPdsUsersReport(client);
  return renderPdsUsersReportTable(report);
}
