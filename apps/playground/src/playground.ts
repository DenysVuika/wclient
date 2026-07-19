import * as dotenv from 'dotenv';
import { join } from 'node:path';
import { WClient, auth } from 'wclient';

dotenv.config();

const authStore = auth.createFileAuthSessionStore(
  join(process.cwd(), '.wclient-auth-session.json'),
);
const client = new WClient({
  authStore,
});

async function main() {
  const session =
    client.getSession() ??
    (await client.login({
      identifier: process.env.BLUESKY_USERNAME,
      password: process.env.BLUESKY_PASSWORD,
    }));

  if (!session) {
    console.error('Login failed. Exiting.');
    return;
  }

  console.log('Logged in successfully.');

  const repoInfo = await client.repo.describeRepo(session.did);
  console.log('Describe repo:', {
    did: repoInfo.did,
    handle: repoInfo.handle,
    collections: repoInfo.collections,
    handleIsCorrect: repoInfo.handleIsCorrect,
  });

  const records = await client.repo.listRecords({
    repo: session.did,
    collection: 'app.bsky.feed.post',
    limit: 10,
  });
  console.log('Records:', JSON.stringify(records, null, 2));
}

main().catch((error: unknown) => {
  console.error('Unhandled error:', error);
  process.exitCode = 1;
});
