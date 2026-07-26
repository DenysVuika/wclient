import { describe, expect, it } from 'vitest';
import stringWidth from 'string-width';
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

  it('keeps borders aligned with unicode content', () => {
    const output = renderAsciiTable({
      headers: ['#', 'DID', 'Handle'],
      rows: [
        ['6', 'did:plc:zdobx3dghonwfuqfdnaejg5x', 'Astrid Christofori (astridchristofori.eurosky.social)'],
        ['7', 'did:plc:i3cvsfgsmkmzfnksmaheumjy', 'Charli ✨ (awildfaerie.com)'],
        ['8', 'did:plc:5rms2ebhdngu24hgsu3s2hqd', 'AngryDutchman (angrydutchman.eurosky.social)'],
      ],
      alignments: ['right', 'left', 'left'],
    });

    const lines = output.split('\n');
    const expectedWidth = stringWidth(lines[0] ?? '');

    for (const line of lines) {
      expect(stringWidth(line)).toBe(expectedWidth);
    }
  });
});
