import * as dotenv from 'dotenv';
import { join } from 'node:path';
import { api, auth, http } from 'wclient';

dotenv.config();

const baseApi = http.createApiClient(() => process.env.BLUESKY_SERVER ?? '');
const authStore = auth.createFileAuthSessionStore(
  join(process.cwd(), '.wclient-auth-session.json'),
);
const authClient = auth.createAuth(baseApi, authStore);
const apiClient = http.createApiClient(
  () => process.env.BLUESKY_SERVER ?? '',
  authClient,
);

async function main() {
  const session =
    authClient.getSession() ??
    (await authClient.login({
      identifier: process.env.BLUESKY_USERNAME,
      password: process.env.BLUESKY_PASSWORD,
    }));

  if (!session) {
    console.error('Login failed. Exiting.');
    return;
  }

  console.log('Logged in successfully.');

  const repoInfo = await api.describeRepo(apiClient, session.did);
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
