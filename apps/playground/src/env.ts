export function getBlueskyServer(): string {
  return process.env.BLUESKY_SERVER ?? '';
}
