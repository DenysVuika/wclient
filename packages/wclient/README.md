# wclient

Minimalistic TypeScript client library for the W social media platform, with a focused subset of Bluesky / AT Protocol XRPC endpoints.

## Install

```bash
npm install wclient
```

## Usage

```ts
import { WClient } from 'wclient';

const client = new WClient();

const repoInfo = await client.repo.describeRepo('did:plc:example');
console.log(repoInfo.handle);
```

Use a custom PDS URL when needed:

```ts
import { WClient } from 'wclient';

const client = new WClient({
  baseUrl: process.env.W_SERVER ?? '',
});
```

Authenticated example:

```ts
import { WClient } from 'wclient';

const client = new WClient();

const session = await client.login({
  identifier: process.env.W_USERNAME,
  password: process.env.W_PASSWORD,
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
  - Helper: `client.repo.listRecords(options)`
  - Example:

```ts
const records = await client.repo.listRecords({
  repo: 'did:plc:example',
  collection: 'app.bsky.feed.post',
  // Optional. Default is 50, range is 1..100.
  limit: 50,
  // Optional pagination cursor from a previous response.
  cursor: undefined,
  // Optional. Reverse record order.
  reverse: false,
});
```

### com.atproto.sync

- `GET /xrpc/com.atproto.sync.listRepos`
  - Helper: `client.sync.listRepos(options?)`
  - Example:

```ts
const page = await client.sync.listRepos({
  // Optional pagination cursor from a previous response.
  cursor: undefined,
  // Optional number of repos in one page.
  limit: 500,
});
```

## CLI

`wclient` also ships with a command-line interface. Run it with `npx` without installing:

```bash
npx wclient <command> [options]
```

### Commands

#### `describe-repo <repo>`

Get information about an account and repository.

```bash
npx wclient describe-repo alice.wsocial.network
```

#### `list-records`

List records in a repository collection.

```bash
npx wclient list-records --repo alice.wsocial.network --collection app.bsky.feed.post
npx wclient list-records --repo alice.wsocial.network --collection app.bsky.feed.post --limit 10
npx wclient list-records --repo alice.wsocial.network --collection app.bsky.feed.post --cursor <cursor> --reverse

# authenticated flow (repo defaults to session.did)
npx wclient --env-file .env --auth list-records --collection "app.bsky.feed.post"
```

Options:

| Flag           | Required | Description                                        |
| -------------- | -------- | -------------------------------------------------- |
| `--repo`       | yes*     | Handle or DID of the repository                    |
| `--collection` | yes      | NSID of the collection (e.g. `app.bsky.feed.post`) |
| `--limit`      | no       | Number of records to return (1–100, default 50)    |
| `--cursor`     | no       | Pagination cursor from a previous response         |
| `--reverse`    | no       | Reverse the order of returned records              |

`*` `--repo` can be omitted when using `--auth`; in that case, the CLI uses the authenticated session DID.

#### `list-repos`

List all repositories on the PDS.

```bash
npx wclient list-repos
```

#### `view <report>`

Render a custom report.

Currently available reports:

- `pds.users`: shows total users, active users, and inactive users across all pages from `com.atproto.sync.listRepos`

```bash
npx wclient view pds.users
npx wclient view pds.users --quiet
npx wclient view pds.users --json
```

Table output example:

```text
PDS Users Report
+----------------+-------+
| Metric         | Value |
+----------------+-------+
| Users          | 1,234 |
| Active users   |   987 |
| Inactive users |   247 |
+----------------+-------+
```

JSON output example:

```json
{
  "users": 1234,
  "activeUsers": 987,
  "inactiveUsers": 247
}
```

### Global options

| Flag                | Description                                                                     |
| ------------------- | ------------------------------------------------------------------------------- |
| `--env-file <path>` | Load environment variables from a specific file                                 |
| `--base-url <url>`  | Override the default PDS URL                                                    |
| `--quiet`           | Suppress non-essential CLI output (for example loading progress in `view` mode) |
| `--help`            | Show help                                                                       |

```bash
npx wclient --env-file .env.local --auth describe-repo
npx wclient --base-url https://my.pds.example list-repos
```

## Environment variables

| Variable             | Description                                                                  |
| -------------------- | ---------------------------------------------------------------------------- |
| `W_USERNAME`         | Handle or DID used for authentication                                        |
| `W_PASSWORD`         | App password used for authentication                                         |
| `W_SERVER`           | PDS base URL (overrides the default `https://pds.wsocial.network`)           |
| `WCLIENT_DEBUG_AUTH` | Set to `1` or `true` to log auth, session restore, and token refresh details |

## Exported modules

- `WClient`: convenience wrapper for auth and namespaced API access
- `DEFAULT_PDS_URL`: default PDS endpoint used by `WClient`
- `api`: low-level typed endpoint helpers and response types
- `auth`: login/refresh flow, session store interfaces, and defaults
- `http`: low-level request client and ETag cache helpers

## License

Apache-2.0
