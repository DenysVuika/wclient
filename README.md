# wclient workspace

This repository contains the publishable `wclient` package plus a small playground app for local development.

If you are looking for the npm package docs, start here: [packages/wclient/README.md](packages/wclient/README.md).

## Local development

Install dependencies:

```bash
pnpm install
```

Common workspace commands:

```bash
pnpm build
pnpm typecheck
pnpm test
pnpm start
```

The workspace is split into:

- [packages/wclient](packages/wclient) for the published library.
- [apps/playground](apps/playground) for the local runnable example.

## Testing the CLI locally

Build the package first, then invoke the CLI via the `cli` script:

```bash
pnpm build

# without the -- separator
pnpm --filter wclient cli list-repos
pnpm --filter wclient cli describe-repo alice.wsocial.network

# with the -- separator (also works — pnpm forwards it, the CLI strips it)
pnpm --filter wclient cli -- list-repos
pnpm --filter wclient cli -- describe-repo alice.wsocial.network
```

### Authenticated commands

Add a `.env` file at the repo root (or wherever you run the command from) with your credentials:

```bash
W_USERNAME=alice.wsocial.network
W_PASSWORD=your-app-password
W_SERVER=https://pds.wsocial.network  # optional, overrides the default PDS URL
```

Then pass `--auth` to enable authentication. The session is cached in `.wclient-auth-session.json`
in the current working directory and reused on subsequent calls.

If you have multiple env files, pass an explicit one with `--env-file`.

```bash
# login and describe your own repo (uses session.did automatically)
pnpm --filter wclient cli -- --auth describe-repo

# list your own records (repo defaults to session.did)
pnpm --filter wclient cli -- --env-file .env --auth list-records --collection "app.bsky.feed.post"

# explicit repo still works with --auth
pnpm --filter wclient cli -- --auth describe-repo other.user.network

# pick a specific env file
pnpm --filter wclient cli -- --env-file .env.staging --auth describe-repo
```

The playground shares the same session file, so logging in via either tool will reuse the cached session in the other.

For release steps and publishing notes, see [RELEASE.md](RELEASE.md).
