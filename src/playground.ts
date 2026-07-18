import * as dotenv from 'dotenv';
import { join } from 'node:path';
import { describeRepo } from './api';
import { createAuth, createFileAuthSessionStore } from './auth';
import { createApiClient } from './http';

dotenv.config();

const baseApi = createApiClient(() => process.env.BLUESKY_SERVER ?? '');
const authStore = createFileAuthSessionStore(
  join(process.cwd(), '.wclient-auth-session.json'),
);
const auth = createAuth(baseApi, authStore);
const api = createApiClient(() => process.env.BLUESKY_SERVER ?? '', auth);

async function main() {
  const session =
    auth.getSession() ??
    (await auth.login({
      identifier: process.env.BLUESKY_USERNAME,
      password: process.env.BLUESKY_PASSWORD,
    }));

  if (!session) {
    console.error('Login failed. Exiting.');
    return;
  }

  console.log('Logged in successfully.');

  const repoInfo = await describeRepo(api, session.did);
  console.log('Describe repo:', {
    did: repoInfo.did,
    handle: repoInfo.handle,
    collections: repoInfo.collections,
    handleIsCorrect: repoInfo.handleIsCorrect,
  });

  // test listRecords

  // const first = await listRecords(api, session.did);
  // console.log('First call from cache:', first.fromCache);

  // const second = await listRecords(api, session.did);
  // console.log('Second call from cache:', second.fromCache);

  // test listRepos
  // const first = await listRepos(api);
  // console.log('First call from cache:', first.fromCache);

  // const second = await listRepos(api);
  // console.log('Second call from cache:', second.fromCache);

  // const response = await listRecords(api, session.did);
  // console.log('Response from cache:', response.fromCache);
  // console.log(JSON.stringify(response.data, null, 2));
}

main().catch((error: unknown) => {
  console.error('Unhandled error:', error);
  process.exitCode = 1;
});
