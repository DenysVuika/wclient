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

For release steps and publishing notes, see [RELEASE.md](RELEASE.md).
