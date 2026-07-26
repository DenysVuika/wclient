export type TableAlignment = 'left' | 'right';

export type RenderAsciiTableOptions = {
  headers: string[];
  rows: string[][];
  alignments?: TableAlignment[];
};

export function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

export function formatReportDate(date: Date): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function padCell(value: string, width: number, alignment: TableAlignment): string {
  return alignment === 'right' ? value.padStart(width, ' ') : value.padEnd(width, ' ');
}

function divider(widths: number[]): string {
  return `+${widths.map((width) => '-'.repeat(width + 2)).join('+')}+`;
}

function row(values: string[], widths: number[], alignments: TableAlignment[]): string {
  const cells = values.map((value, index) => padCell(value, widths[index] ?? 0, alignments[index] ?? 'left'));
  return `| ${cells.join(' | ')} |`;
}

export function renderAsciiTable(options: RenderAsciiTableOptions): string {
  const { headers, rows, alignments = [] } = options;

  const columnCount = headers.length;
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((entry) => (entry[index] ?? '').length)),
  );
  const line = divider(widths);

  const output = [
    line,
    row(headers, widths, alignments),
    line,
    ...rows.map((entry) => {
      if (entry.length !== columnCount) {
        throw new Error('Invalid table row: row column count does not match header column count.');
      }
      return row(entry, widths, alignments);
    }),
    line,
  ];

  return output.join('\n');
}
