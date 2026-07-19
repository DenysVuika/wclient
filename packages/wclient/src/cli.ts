import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { createFileAuthSessionStore, type Session } from './auth/index.js';
import { DEFAULT_PDS_URL, WClient } from './wclient.js';

function extractEnvFileArg(args: string[]): string | null | undefined {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--env-file') {
      return args[i + 1] ?? null;
    }

    if (arg?.startsWith('--env-file=')) {
      const value = arg.slice('--env-file='.length);
      return value.length > 0 ? value : null;
    }
  }

  return undefined;
}

function stripEnvFileArg(args: string[]): string[] {
  const result: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) {
      continue;
    }

    if (arg === '--env-file') {
      i++;
      continue;
    }

    if (arg?.startsWith('--env-file=')) {
      continue;
    }

    result.push(arg);
  }

  return result;
}

function findWorkspaceRoot(startDir: string): string | null {
  let currentDir = startDir;
  while (true) {
    if (existsSync(join(currentDir, 'pnpm-workspace.yaml'))) {
      return currentDir;
    }

    const parentDir = dirname(currentDir);
    if (parentDir === currentDir) {
      return null;
    }
    currentDir = parentDir;
  }
}

function loadEnv(explicitEnvFile: string | undefined): void {
  if (explicitEnvFile) {
    const baseDir = findWorkspaceRoot(process.cwd()) ?? process.cwd();
    const envPath = isAbsolute(explicitEnvFile)
      ? explicitEnvFile
      : resolve(baseDir, explicitEnvFile);

    if (!existsSync(envPath)) {
      console.error(`Error: --env-file not found: ${envPath}`);
      process.exit(1);
    }

    dotenv.config({ path: envPath, quiet: true });
    return;
  }

  const workspaceRoot = findWorkspaceRoot(process.cwd());
  const candidateDirs = [process.env.INIT_CWD, workspaceRoot, process.cwd()].filter(
    (value, index, all): value is string =>
      typeof value === 'string' && value.length > 0 && all.indexOf(value) === index,
  );

  for (const dir of candidateDirs) {
    const envPath = join(dir, '.env');
    if (existsSync(envPath)) {
      dotenv.config({ path: envPath, quiet: true });
      return;
    }
  }

  dotenv.config({ quiet: true });
}

const explicitEnvFile = extractEnvFileArg(process.argv.slice(2));
if (explicitEnvFile === null) {
  console.error('Error: --env-file requires a path value.');
  process.exit(1);
}

loadEnv(explicitEnvFile);

const rawArgs = stripEnvFileArg(process.argv.slice(2)).filter(
  (arg) => arg !== '--',
);
const commandIndex = rawArgs.findIndex((arg) => !arg.startsWith('--'));
const command = commandIndex === -1 ? undefined : rawArgs[commandIndex];
const rest =
  commandIndex === -1
    ? rawArgs
    : rawArgs.filter((_, index) => index !== commandIndex);

type Flags = Record<string, string | boolean>;

function parseArgs(args: string[]): { flags: Flags; positional: string[] } {
  const flags: Flags = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === undefined) continue;
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }

  return { flags, positional };
}

function printHelp(): void {
  console.log(`wclient - CLI for the W social media platform

Usage: wclient <command> [options]

Commands:
  describe-repo <repo>          Get information about an account and repository
  list-records                  List records in a repository collection
  list-repos                    List repositories on the PDS

Global Options:
  --env-file <path>             Load environment variables from a specific file
  --base-url <url>              PDS base URL (default: ${DEFAULT_PDS_URL})
  --auth                        Authenticate using W_USERNAME and W_PASSWORD
  --help                        Show this help message

Examples:
  wclient describe-repo alice.wsocial.network
  wclient list-records --repo alice.wsocial.network --collection app.bsky.feed.post --limit 10
  wclient list-repos`);
}

async function main(): Promise<void> {
  if (command === undefined || command === '--help' || command === 'help') {
    printHelp();
    return;
  }

  const { flags, positional } = parseArgs(rest);
  const baseUrl =
    typeof flags['base-url'] === 'string'
      ? flags['base-url']
      : process.env.W_SERVER;

  let session: Session | null = null;
  let client: WClient;

  if (flags['auth'] === true) {
    const identifier = process.env.W_USERNAME;
    const password = process.env.W_PASSWORD;
    if (!identifier || !password) {
      console.error(
        'Error: --auth requires W_USERNAME and W_PASSWORD to be set in the environment or .env file.',
      );
      process.exit(1);
    }
    const authStore = createFileAuthSessionStore(
      join(process.cwd(), '.wclient-auth-session.json'),
    );
    client = new WClient({ ...(baseUrl ? { baseUrl } : {}), authStore });
    session =
      client.getSession() ?? (await client.login({ identifier, password }));
    if (!session) {
      console.error('Authentication failed.');
      process.exit(1);
    }
  } else {
    client = new WClient(baseUrl ? { baseUrl } : {});
  }

  switch (command) {
    case 'describe-repo': {
      const repo =
        positional[0] ??
        (typeof flags['repo'] === 'string' ? flags['repo'] : undefined) ??
        session?.did;
      if (!repo) {
        console.error('Error: <repo> argument is required (or use --auth to use the authenticated DID).');
        console.error('Usage: wclient describe-repo [<repo>] [--auth]');
        process.exit(1);
      }
      const result = await client.repo.describeRepo(repo);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'list-records': {
      const repo =
        (typeof flags['repo'] === 'string' ? flags['repo'] : undefined) ??
        session?.did;
      const collection =
        typeof flags['collection'] === 'string'
          ? flags['collection']
          : undefined;
      if (!repo || !collection) {
        console.error(
          'Error: --collection is required; --repo is required unless using --auth with an authenticated session.',
        );
        console.error(
          'Usage: wclient list-records [--repo <repo>] --collection <nsid> [--limit N] [--cursor X] [--reverse] [--auth]',
        );
        process.exit(1);
      }
      const limit =
        typeof flags['limit'] === 'string' ? Number(flags['limit']) : undefined;
      const cursor =
        typeof flags['cursor'] === 'string' ? flags['cursor'] : undefined;
      const result = await client.repo.listRecords({
        repo,
        collection,
        ...(limit !== undefined ? { limit } : {}),
        ...(cursor !== undefined ? { cursor } : {}),
        ...(flags['reverse'] === true ? { reverse: true } : {}),
      });
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'list-repos': {
      const result = await client.sync.listRepos();
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    default: {
      console.error(`Unknown command: ${command}`);
      console.error('Run "wclient --help" for usage.');
      process.exit(1);
    }
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
