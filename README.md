# wclient

Minimal TypeScript library for a small, focused subset of Bluesky / AT Protocol XRPC endpoints.

## What this project does

- Exports reusable `api`, `auth`, and `http` modules from the package root.
- Persists session tokens locally (file-backed store).
- Auto-refreshes access tokens on `401` and retries once.
- Calls a small set of typed API helpers.

## Supported API subset

### com.atproto.server

- `POST /xrpc/com.atproto.server.createSession`
  - Used for initial login.
- `POST /xrpc/com.atproto.server.refreshSession`
  - Used to refresh access tokens.

### com.atproto.repo

- `GET /xrpc/com.atproto.repo.describeRepo`
  - Implemented in `src/api/repo.ts` as `describeRepo`.
- `GET /xrpc/com.atproto.repo.listRecords`
  - Implemented in `src/api/repo.ts` as `listRecords`.

### com.atproto.sync

- `GET /xrpc/com.atproto.sync.listRepos`
  - Implemented in `src/api/sync.ts` as `listRepos`.

## Setup

Install dependencies:

```bash
pnpm install
```

Configure environment values in `.env` (see `.env.example`):

- `BLUESKY_SERVER`
- `BLUESKY_USERNAME`
- `BLUESKY_PASSWORD`
- Optional: `WCLIENT_DEBUG_AUTH=1` (or `true`) for auth/session debug logs.

Build the library:

```bash
pnpm build
```

## Notes

- Session data is stored in `.wclient-auth-session.json`.
- The session store API is pluggable: you can replace the file-backed store with a more secure implementation later.
- This is intentionally minimal and not a complete Bluesky SDK.

## License

Apache License 2.0. See [LICENSE](/home/denys/projects/atproto/wclient/LICENSE) for details.
