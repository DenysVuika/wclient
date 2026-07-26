import type { WClient } from '../wclient.js';

const MICROCOSM_BASE_URL = 'https://constellation.microcosm.blue';
const GET_BACKLINKS_PATH = '/xrpc/blue.microcosm.links.getBacklinks';
const BLOCK_SUBJECT_SOURCE = 'app.bsky.graph.block:subject';

type BacklinkRecord = {
  did: string;
  collection: string;
  rkey: string;
};

type BacklinksResponse = {
  total: number;
  records: BacklinkRecord[];
  cursor?: string | null;
};

export type MeHatersReport = {
  subjectDid: string;
  total: number;
  blockers: string[];
  pagesFetched: number;
};

export type MeHatersReportProgress = {
  pagesFetched: number;
  recordsSoFar: number;
  blockersSoFar: number;
};

export type GetMeHatersReportOptions = {
  did?: string;
  limit?: number;
  reverse?: boolean;
  onProgress?: (progress: MeHatersReportProgress) => void;
};

function assertLimit(limit: number | undefined): void {
  if (limit === undefined) {
    return;
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error(
      'Invalid limit value: expected an integer in range 1..100.',
    );
  }
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

function divider(indexWidth: number, didWidth: number): string {
  return `+${'-'.repeat(indexWidth + 2)}+${'-'.repeat(didWidth + 2)}+`;
}

function tableRow(
  index: string,
  did: string,
  indexWidth: number,
  didWidth: number,
): string {
  return `| ${padLeft(index, indexWidth)} | ${padRight(did, didWidth)} |`;
}

function formatReportDate(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

export async function getMeHatersReport(
  client: WClient,
  options?: GetMeHatersReportOptions,
): Promise<MeHatersReport> {
  const subjectDid = options?.did ?? client.getSession()?.did;
  if (!subjectDid) {
    throw new Error(
      'Unable to resolve DID. Authenticate first or pass options.did.',
    );
  }

  assertLimit(options?.limit);

  const blockersSet = new Set<string>();
  let cursor: string | undefined;
  let total = 0;
  let pagesFetched = 0;
  let recordsSoFar = 0;

  do {
    const url = new URL(GET_BACKLINKS_PATH, MICROCOSM_BASE_URL);
    url.searchParams.set('subject', subjectDid);
    url.searchParams.set('source', BLOCK_SUBJECT_SOURCE);
    if (cursor !== undefined) {
      url.searchParams.set('cursor', cursor);
    }
    if (options?.limit !== undefined) {
      url.searchParams.set('limit', String(options.limit));
    }
    if (options?.reverse === true) {
      url.searchParams.set('reverse', 'true');
    }

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept-Encoding': 'gzip',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to load haters report (${response.status} ${response.statusText}).`,
      );
    }

    const data = (await response.json()) as BacklinksResponse;
    if (pagesFetched === 0) {
      total = data.total;
    }

    for (const record of data.records) {
      blockersSet.add(record.did);
    }

    recordsSoFar += data.records.length;
    pagesFetched += 1;
    options?.onProgress?.({
      pagesFetched,
      recordsSoFar,
      blockersSoFar: blockersSet.size,
    });

    cursor = data.cursor ?? undefined;
  } while (cursor !== undefined);

  return {
    subjectDid,
    total,
    blockers: [...blockersSet],
    pagesFetched,
  };
}

export function renderMeHatersReportTable(
  report: MeHatersReport,
  date: Date = new Date(),
): string {
  const rows: Array<[string, string]> =
    report.blockers.length > 0
      ? report.blockers.map((did, index) => [String(index + 1), did])
      : [['-', 'None']];

  const indexWidth = Math.max(
    '#'.length,
    ...rows.map(([index]) => index.length),
  );
  const didWidth = Math.max('DID'.length, ...rows.map(([, did]) => did.length));
  const line = divider(indexWidth, didWidth);

  const output = [
    `Me Haters: ${formatReportDate(date)}`,
    `Subject DID: ${report.subjectDid}`,
    `Total blockers: ${formatNumber(report.blockers.length)} (records: ${formatNumber(report.total)})`,
    line,
    tableRow('#', 'DID', indexWidth, didWidth),
    line,
    ...rows.map(([index, did]) => tableRow(index, did, indexWidth, didWidth)),
    line,
  ];

  return output.join('\n');
}

export async function buildMeHatersReportTable(
  client: WClient,
  options?: GetMeHatersReportOptions,
): Promise<string> {
  const report = await getMeHatersReport(client, options);
  return renderMeHatersReportTable(report);
}
