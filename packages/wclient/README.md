# wclient

Minimalistic TypeScript client library for the W social media platform, with a focused subset of Bluesky / AT Protocol XRPC endpoints.

## Install

```bash
npm install wclient
```

## Usage

```ts
import { api, auth, http } from 'wclient';

const baseApi = http.createApiClient(() => process.env.BLUESKY_SERVER ?? '');
const authClient = auth.createAuth(baseApi);
const client = http.createApiClient(() => process.env.BLUESKY_SERVER ?? '', authClient);

const session = await authClient.login({
  identifier: process.env.BLUESKY_USERNAME,
  password: process.env.BLUESKY_PASSWORD,
});

if (session) {
  const repoInfo = await api.describeRepo(client, session.did);
  console.log(repoInfo.handle);
}
```

## Modules

- `api`: typed endpoint helpers
- `auth`: login/session helpers and stores
- `http`: low-level API client and cache utilities

## License

Apache-2.0
