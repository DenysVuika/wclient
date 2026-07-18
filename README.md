# wclient

Minimalistic TypeScript client library for the W social media platform, containing a focused subset of Bluesky / AT Protocol XRPC endpoints.

> [!WARNING]
> This project is in active development. Breaking changes may happen in minor releases until `v1.0.0`.

## What this project does

- Exports reusable `api`, `auth`, and `http` modules from the package root.
- Uses an in-memory auth session store by default, with optional pluggable persistence.
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
  - Implemented in `packages/wclient/src/api/repo.ts` as `describeRepo`.
- `GET /xrpc/com.atproto.repo.listRecords`
  - Implemented in `packages/wclient/src/api/repo.ts` as `listRecords`.

### com.atproto.sync

- `GET /xrpc/com.atproto.sync.listRepos`
  - Implemented in `packages/wclient/src/api/sync.ts` as `listRepos`.

## Workspace layout

- `packages/wclient`: publishable TypeScript library.
- `apps/playground`: local runnable app that consumes `wclient` via `workspace:*`.

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

Build workspace projects:

```bash
pnpm build
```

Run the playground app:

```bash
pnpm start
```

## Notes

- Session data is only stored on disk when you provide a persistent store such as the file-backed store used by the local playground.
- The default auth session store is in-memory, and the session store API is pluggable if you want file-backed or custom persistence.
- This is intentionally minimal and not a complete Bluesky SDK.

## License

Apache License 2.0. See [LICENSE](LICENSE) for details.
