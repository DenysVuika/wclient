import { describe, expect, it } from 'vitest';
import { formatNumber, renderAsciiTable } from './table';

describe('table utilities', () => {
  it('renders an ascii table with column alignment and computed widths', () => {
    const output = renderAsciiTable({
      headers: ['Metric', 'Value'],
      rows: [
        ['A', '1'],
        ['Long metric', '22'],
      ],
      alignments: ['left', 'right'],
    });

    expect(output).toBe(
      [
        '+-------------+-------+',
        '| Metric      | Value |',
        '+-------------+-------+',
        '| A           |     1 |',
        '| Long metric |    22 |',
        '+-------------+-------+',
      ].join('\n')
    );
  });

  it('defaults to left alignment when alignments are omitted', () => {
    const output = renderAsciiTable({
      headers: ['Col1', 'Col2'],
      rows: [['x', 'y']],
    });

    expect(output).toContain('| x    | y    |');
  });

  it('throws when row width does not match headers', () => {
    expect(() =>
      renderAsciiTable({
        headers: ['A', 'B'],
        rows: [['only-a']],
      })
    ).toThrow('Invalid table row: row column count does not match header column count.');
  });

  it('formats numbers in en-US style', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });
});
