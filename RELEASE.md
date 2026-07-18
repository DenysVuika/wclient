# Release Guide

This project uses Changesets for versioning and GitHub Actions for publishing.

## Quick release (5 steps)

1. Make code changes and run checks:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

1. Create a changeset:

```bash
pnpm changeset
```

1. Commit both code and `.changeset/*.md`, then open a PR to `main`.
2. Merge the PR after CI passes.
3. Merge the generated "Version Packages" PR to publish to npm.

## Normal release flow

1. Create a feature or fix branch.
2. Make code changes.
3. Run local checks:

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

1. Create a changeset:

```bash
pnpm changeset
```

1. Select the target package and choose bump type:
   - `patch`: bug fixes
   - `minor`: backward-compatible features
   - `major`: breaking changes
2. Commit code changes and the generated `.changeset/*.md` file.
3. Open a pull request to `main`.
4. Merge when PR CI passes.

## What happens after merge

1. Release workflow runs on `main`.
2. Changesets action opens or updates a "Version Packages" pull request.
3. Merge the "Version Packages" pull request.
4. Workflow publishes the new version to npm using trusted publishing.

## Verify release

1. Confirm release workflow run succeeded in GitHub Actions.
2. Confirm new version is visible on npm.
3. Optionally verify package contents:

```bash
cd packages/<library-package>
npm pack --dry-run
```

## Useful commands

```bash
pnpm changeset
pnpm version-packages
pnpm release
```
