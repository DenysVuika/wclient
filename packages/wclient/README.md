# wclient

Minimalistic TypeScript client library for the W social media platform, with a focused subset of Bluesky / AT Protocol XRPC endpoints.

## Install

```bash
npm install wclient
```

## Usage

```ts
import { api, http } from 'wclient';

const apiClient = http.createApiClient(
  () => process.env.BLUESKY_SERVER ?? '',
);

const repoInfo = await api.describeRepo(apiClient, 'did:plc:example');
console.log(repoInfo.handle);
```

Authenticated example:

```ts
import { api, auth, http } from 'wclient';

const authClient = auth.createAuth(
  http.createApiClient(() => process.env.BLUESKY_SERVER ?? ''),
);
const apiClient = http.createApiClient(
  () => process.env.BLUESKY_SERVER ?? '',
  authClient,
);

const session = await authClient.login({
  identifier: process.env.BLUESKY_USERNAME,
  password: process.env.BLUESKY_PASSWORD,
});

if (session) {
  const repoInfo = await api.describeRepo(apiClient, session.did);
  console.log(repoInfo.handle);
}
```

## Supported API subset

### com.atproto.server

- `POST /xrpc/com.atproto.server.createSession`
- `POST /xrpc/com.atproto.server.refreshSession`

### com.atproto.repo

- `GET /xrpc/com.atproto.repo.describeRepo`
  - Helper: `api.describeRepo(apiClient, repo)`
- `GET /xrpc/com.atproto.repo.listRecords`
  - Helper: `api.listRecords(apiClient, repoDid)`

### com.atproto.sync

- `GET /xrpc/com.atproto.sync.listRepos`
  - Helper: `api.listRepos(apiClient)`

## Exported modules

- `api`: typed endpoint helpers and response types
- `auth`: login/refresh flow, session store interfaces, and defaults
- `http`: low-level request client and ETag cache helpers

## License

Apache-2.0
