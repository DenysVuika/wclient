import { afterEach, describe, expect, it } from 'vitest';
import { getBlueskyServer } from './env';

describe('getBlueskyServer', () => {
  const originalServer = process.env.BLUESKY_SERVER;

  afterEach(() => {
    if (originalServer === undefined) {
      delete process.env.BLUESKY_SERVER;
      return;
    }

    process.env.BLUESKY_SERVER = originalServer;
  });

  it('returns empty string when BLUESKY_SERVER is not set', () => {
    delete process.env.BLUESKY_SERVER;
    expect(getBlueskyServer()).toBe('');
  });

  it('returns BLUESKY_SERVER value when set', () => {
    process.env.BLUESKY_SERVER = 'https://bsky.social';
    expect(getBlueskyServer()).toBe('https://bsky.social');
  });
});
