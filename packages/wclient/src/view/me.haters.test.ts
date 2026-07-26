import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMeHatersReport, renderMeHatersReportTable } from './me.haters';
import { WClient } from '../wclient';

function toRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

describe('me.haters report', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('aggregates paginated backlinks into a unique blockers list', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            total: 3,
            records: [
              {
                did: 'did:plc:first',
                collection: 'app.bsky.graph.block',
                rkey: 'a',
              },
              {
                did: 'did:plc:second',
                collection: 'app.bsky.graph.block',
                rkey: 'b',
              },
            ],
            cursor: 'next',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            total: 3,
            records: [
              {
                did: 'did:plc:second',
                collection: 'app.bsky.graph.block',
                rkey: 'c',
              },
              {
                did: 'did:plc:third',
                collection: 'app.bsky.graph.block',
                rkey: 'd',
              },
            ],
            cursor: null,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const client = new WClient();
    const getProfile = vi.fn().mockImplementation(async (actor: string) => {
      if (actor === 'did:plc:first') {
        return { did: actor, handle: 'first.test', displayName: 'First User' };
      }
      if (actor === 'did:plc:second') {
        return { did: actor, handle: 'second.test', displayName: 'Second User' };
      }
      return { did: actor, handle: 'third.test', displayName: 'Third User' };
    });
    client.actor.getProfile = getProfile;

    const report = await getMeHatersReport(client, {
      did: 'did:plc:me',
      limit: 100,
      reverse: true,
    });

    expect(report).toEqual({
      subjectDid: 'did:plc:me',
      total: 3,
      blockers: [
        {
          did: 'did:plc:first',
          handle: 'first.test',
          displayName: 'First User',
        },
        {
          did: 'did:plc:second',
          handle: 'second.test',
          displayName: 'Second User',
        },
        {
          did: 'did:plc:third',
          handle: 'third.test',
          displayName: 'Third User',
        },
      ],
      pagesFetched: 2,
    });
    expect(getProfile).toHaveBeenCalledTimes(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url1Input] = fetchMock.mock.calls[0] as [RequestInfo | URL, RequestInit];
    const [url2Input] = fetchMock.mock.calls[1] as [RequestInfo | URL, RequestInit];
    const url1 = toRequestUrl(url1Input);
    const url2 = toRequestUrl(url2Input);

    expect(url1).toContain('subject=did%3Aplc%3Ame');
    expect(url1).toContain('source=app.bsky.graph.block%3Asubject');
    expect(url1).toContain('limit=100');
    expect(url1).toContain('reverse=true');
    expect(url2).toContain('cursor=next');
  });

  it('resolves did from authenticated session when options.did is omitted', async () => {
    const session = {
      accessJwt: 'access-token',
      refreshJwt: 'refresh-token',
      did: 'did:plc:me-from-session',
      handle: 'me.test',
      email: 'me@example.com',
      emailConfirmed: true,
      active: true,
      wsocialVerified: 'false',
    };

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          total: 1,
          records: [
            {
              did: 'did:plc:hater',
              collection: 'app.bsky.graph.block',
              rkey: 'a',
            },
          ],
          cursor: null,
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const client = new WClient();
    vi.spyOn(client, 'getSession').mockReturnValue(session);
    client.actor.getProfile = vi.fn().mockResolvedValue({
      did: 'did:plc:hater',
      handle: 'hater.test',
      displayName: 'Hater',
    });

    const report = await getMeHatersReport(client);

    expect(report.subjectDid).toBe(session.did);
  });

  it('reports pagination progress', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            total: 3,
            records: [
              {
                did: 'did:plc:first',
                collection: 'app.bsky.graph.block',
                rkey: 'a',
              },
              {
                did: 'did:plc:second',
                collection: 'app.bsky.graph.block',
                rkey: 'b',
              },
            ],
            cursor: 'next',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            total: 3,
            records: [
              {
                did: 'did:plc:third',
                collection: 'app.bsky.graph.block',
                rkey: 'c',
              },
            ],
            cursor: null,
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      );
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const client = new WClient();
    client.actor.getProfile = vi.fn().mockResolvedValue({
      did: 'did:plc:any',
      handle: 'any.test',
      displayName: 'Any',
    });
    const progressEvents: Array<{
      pagesFetched: number;
      recordsSoFar: number;
      blockersSoFar: number;
    }> = [];

    await getMeHatersReport(client, {
      did: 'did:plc:me',
      onProgress: (progress) => {
        progressEvents.push(progress);
      },
    });

    expect(progressEvents).toEqual([
      { pagesFetched: 1, recordsSoFar: 2, blockersSoFar: 2 },
      { pagesFetched: 2, recordsSoFar: 3, blockersSoFar: 3 },
    ]);
  });

  it('renders an ascii table', () => {
    const output = renderMeHatersReportTable(
      {
        subjectDid: 'did:plc:me',
        total: 2,
        blockers: [
          { did: 'did:plc:first', handle: 'first.test', displayName: 'First User' },
          { did: 'did:plc:second', handle: 'second.test', displayName: 'Second User' },
        ],
        pagesFetched: 1,
      },
      new Date('2026-07-25T00:00:00Z')
    );

    expect(output).toContain('Me Haters: 25 July 2026');
    expect(output).toContain('Subject DID: did:plc:me');
    expect(output).toContain('Total blockers: 2 (records: 2)');
    expect(output).toContain('| 1 | did:plc:first  | First User (first.test)   |');
    expect(output).toContain('| 2 | did:plc:second | Second User (second.test) |');
  });
});
