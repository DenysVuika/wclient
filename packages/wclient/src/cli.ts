import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { createFileAuthSessionStore, type Session } from './auth/index.js';
import { getMeHatersReport, renderMeHatersReportTable } from './view/me.haters.js';
import { getPdsUsersReport, renderPdsUsersReportTable } from './view/pds.users.js';
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
    const envPath = isAbsolute(explicitEnvFile) ? explicitEnvFile : resolve(baseDir, explicitEnvFile);

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
      typeof value === 'string' && value.length > 0 && all.indexOf(value) === index
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

const rawArgs = stripEnvFileArg(process.argv.slice(2)).filter((arg) => arg !== '--');
const commandIndex = rawArgs.findIndex((arg) => !arg.startsWith('--'));
const command = commandIndex === -1 ? undefined : rawArgs[commandIndex];
const rest = commandIndex === -1 ? rawArgs : rawArgs.filter((_, index) => index !== commandIndex);

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
  get-profile <actor>           Get detailed profile view for a handle or DID
  list-records                  List records in a repository collection
  list-repos                    List repositories on the PDS
  view <report>                 Render a custom report

Global Options:
  --env-file <path>             Load environment variables from a specific file
  --base-url <url>              PDS base URL (default: ${DEFAULT_PDS_URL})
  --auth                        Authenticate using W_USERNAME and W_PASSWORD
  --quiet                       Suppress non-essential CLI output
  --help                        Show this help message

Examples:
  wclient describe-repo alice.wsocial.network
  wclient get-profile did:plc:alice
  wclient list-records --repo alice.wsocial.network --collection app.bsky.feed.post --limit 10
  wclient list-repos
  wclient view pds.users
  wclient view me.haters --did did:plc:example
  wclient view pds.users --quiet
  wclient view pds.users --json
  wclient view me.haters --auth --limit 100 --reverse`);
}

async function main(): Promise<void> {
  if (command === undefined || command === '--help' || command === 'help') {
    printHelp();
    return;
  }

  const { flags, positional } = parseArgs(rest);
  const baseUrl = typeof flags['base-url'] === 'string' ? flags['base-url'] : process.env.W_SERVER;

  async function authenticateFromEnvOrExit(
    requireCredentials: boolean
  ): Promise<{ client: WClient; session: Session | null }> {
    const identifier = process.env.W_USERNAME;
    const password = process.env.W_PASSWORD;

    if ((!identifier || !password) && requireCredentials) {
      console.error(
        'Error: authentication requires W_USERNAME and W_PASSWORD to be set in the environment or .env file.'
      );
      process.exit(1);
    }

    if (!identifier || !password) {
      return {
        client: new WClient(baseUrl ? { baseUrl } : {}),
        session: null,
      };
    }

    const authStore = createFileAuthSessionStore(join(process.cwd(), '.wclient-auth-session.json'));
    const authenticatedClient = new WClient({
      ...(baseUrl ? { baseUrl } : {}),
      authStore,
    });
    const authenticatedSession =
      authenticatedClient.getSession() ?? (await authenticatedClient.login({ identifier, password }));

    return {
      client: authenticatedClient,
      session: authenticatedSession,
    };
  }

  let session: Session | null = null;
  let client: WClient;

  if (flags['auth'] === true) {
    const authResult = await authenticateFromEnvOrExit(true);
    client = authResult.client;
    session = authResult.session;
    if (!session) {
      console.error('Authentication failed.');
      process.exit(1);
    }
  } else {
    client = new WClient(baseUrl ? { baseUrl } : {});
  }

  switch (command) {
    case 'describe-repo': {
      const repo = positional[0] ?? (typeof flags['repo'] === 'string' ? flags['repo'] : undefined) ?? session?.did;
      if (!repo) {
        console.error('Error: <repo> argument is required (or use --auth to use the authenticated DID).');
        console.error('Usage: wclient describe-repo [<repo>] [--auth]');
        process.exit(1);
      }
      const result = await client.repo.describeRepo(repo);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'get-profile': {
      if (flags['auth'] !== true) {
        const authResult = await authenticateFromEnvOrExit(false);
        if (authResult.session) {
          client = authResult.client;
          session = authResult.session;
        }
      }

      const actor = positional[0] ?? (typeof flags['actor'] === 'string' ? flags['actor'] : undefined) ?? session?.did;
      if (!actor) {
        console.error('Error: <actor> argument is required (or use --auth to use the authenticated DID).');
        console.error('Usage: wclient get-profile <actor> [--auth]');
        process.exit(1);
      }

      const result = await client.actor.getProfile(actor);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'list-records': {
      const repo = (typeof flags['repo'] === 'string' ? flags['repo'] : undefined) ?? session?.did;
      const collection = typeof flags['collection'] === 'string' ? flags['collection'] : undefined;
      if (!repo || !collection) {
        console.error(
          'Error: --collection is required; --repo is required unless using --auth with an authenticated session.'
        );
        console.error(
          'Usage: wclient list-records [--repo <repo>] --collection <nsid> [--limit N] [--cursor X] [--reverse] [--auth]'
        );
        process.exit(1);
      }
      const limit = typeof flags['limit'] === 'string' ? Number(flags['limit']) : undefined;
      const cursor = typeof flags['cursor'] === 'string' ? flags['cursor'] : undefined;
      const result = await client.repo.listRecords({
        repo,
        collection,
        ...(limit !== undefined ? { limit } : {}),
        ...(cursor !== undefined ? { cursor } : {}),
        ...(flags['reverse'] === true ? { reverse: true } : {}),
      });
      console.log(JSON.stringify(result.data, null, 2));
      break;
    }

    case 'list-repos': {
      const result = await client.sync.listRepos();
      console.log(JSON.stringify(result.data, null, 2));
      break;
    }

    case 'view': {
      const report = positional[0] ?? (typeof flags['report'] === 'string' ? flags['report'] : undefined);
      const wantsJson = flags['json'] === true;
      const quiet = flags['quiet'] === true;

      if (!report) {
        console.error('Error: <report> argument is required.');
        console.error('Usage: wclient view <report> [did] [--did <did>] [--json] [--quiet] [--auth]');
        console.error('Available reports: pds.users, me.haters');
        process.exit(1);
      }

      switch (report) {
        case 'pds.users': {
          if (wantsJson) {
            const result = await getPdsUsersReport(client);
            console.log(JSON.stringify(result, null, 2));
          } else {
            if (process.stderr.isTTY && !quiet) {
              process.stderr.write('Loading users...\r');
            }

            const result = await getPdsUsersReport(client, {
              onProgress: ({ pagesFetched, usersSoFar }) => {
                if (!process.stderr.isTTY || quiet) return;
                process.stderr.write(
                  `Loading users... pages: ${pagesFetched}, users: ${usersSoFar.toLocaleString('en-US')}\r`
                );
              },
            });

            if (process.stderr.isTTY && !quiet) {
              process.stderr.write('\n');
            }

            const table = renderPdsUsersReportTable(result);
            console.log(table);
          }
          break;
        }

        case 'me.haters': {
          if (flags['auth'] !== true) {
            const authResult = await authenticateFromEnvOrExit(false);
            if (authResult.session) {
              client = authResult.client;
              session = authResult.session;
            }
          }

          let did = (typeof flags['did'] === 'string' ? flags['did'] : undefined) ?? positional[1] ?? session?.did;

          if (!did) {
            console.error(
              'Error: me.haters requires a DID. Provide --did <did>, a positional DID, or set W_USERNAME and W_PASSWORD in .env for automatic authentication.'
            );
            process.exit(1);
          }

          const limit = typeof flags['limit'] === 'string' ? Number(flags['limit']) : undefined;
          if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) {
            console.error('Error: --limit must be an integer in range 1..100.');
            process.exit(1);
          }

          const reverse = flags['reverse'] === true;
          const reportOptions = {
            did,
            reverse,
            ...(limit !== undefined ? { limit } : {}),
          };

          if (wantsJson) {
            const result = await getMeHatersReport(client, reportOptions);
            console.log(JSON.stringify(result, null, 2));
          } else {
            if (process.stderr.isTTY && !quiet) {
              process.stderr.write('Loading blockers...\r');
            }

            const result = await getMeHatersReport(client, {
              ...reportOptions,
              onProgress: ({ pagesFetched, recordsSoFar, blockersSoFar }) => {
                if (!process.stderr.isTTY || quiet) return;
                process.stderr.write(
                  `Loading blockers... pages: ${pagesFetched}, records: ${recordsSoFar.toLocaleString('en-US')}, unique users: ${blockersSoFar.toLocaleString('en-US')}\r`
                );
              },
            });

            if (process.stderr.isTTY && !quiet) {
              process.stderr.write('\n');
            }

            const table = renderMeHatersReportTable(result);
            console.log(table);
          }
          break;
        }

        default: {
          console.error(`Unknown report: ${report}`);
          console.error('Available reports: pds.users, me.haters');
          process.exit(1);
        }
      }

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
