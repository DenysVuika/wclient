# wclient

Minimalistic TypeScript client library for the W social media platform, with a focused subset of Bluesky / AT Protocol XRPC endpoints.

## Install

```bash
npm install wclient
```

## Usage

```ts
import { WClient } from 'wclient';

const client = new WClient({
  baseUrl: process.env.BLUESKY_SERVER ?? '',
});

const repoInfo = await client.repo.describeRepo('did:plc:example');
console.log(repoInfo.handle);
```

Authenticated example:

```ts
import { WClient, auth } from 'wclient';

const client = new WClient({
  baseUrl: process.env.BLUESKY_SERVER ?? '',
  authStore: auth.createInMemoryAuthSessionStore(),
});

const session = await client.login({
  identifier: process.env.BLUESKY_USERNAME,
  password: process.env.BLUESKY_PASSWORD,
});

if (session) {
  const repoInfo = await client.repo.describeRepo(session.did);
  console.log(repoInfo.handle);
}
```

## Supported API subset

### com.atproto.server

- `POST /xrpc/com.atproto.server.createSession`
- `POST /xrpc/com.atproto.server.refreshSession`

### com.atproto.repo

- `GET /xrpc/com.atproto.repo.describeRepo`
  - Helper: `client.repo.describeRepo(repo)`
- `GET /xrpc/com.atproto.repo.listRecords`
  - Helper: `client.repo.listRecords(repoDid)`

### com.atproto.sync

- `GET /xrpc/com.atproto.sync.listRepos`
  - Helper: `client.sync.listRepos()`

## Exported modules

- `WClient`: convenience wrapper for auth and namespaced API access
- `api`: low-level typed endpoint helpers and response types
- `auth`: login/refresh flow, session store interfaces, and defaults
- `http`: low-level request client and ETag cache helpers

## License

Apache-2.0
