import * as dotenv from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { createFileAuthSessionStore, type Session } from './auth/index.js';
import { formatNumber, renderAsciiTable } from './utils/table.js';
import { getMeHatersReport, renderMeHatersReportTable } from './view/me.haters.js';
import { getPdsUsersReport, renderPdsUsersReportTable, syncPdsProfileCache } from './view/pds.users.js';
import { clearProfileCache, getCacheSize } from './view/profile-cache.js';
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

// Handle cache clearing early before parsing command
if (rawArgs.includes('--clear-profile-cache')) {
  const cacheSize = getCacheSize();
  clearProfileCache();
  const cacheStatus =
    cacheSize > 0 ? `Cleared profile cache (${cacheSize} entries).` : 'Profile cache is already empty.';
  console.log(cacheStatus);
  process.exit(0);
}

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

function parsePositiveIntegerFlag(flags: Flags, name: string): number | undefined {
  const value = flags[name];
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    console.error(`Error: --${name} requires a positive integer value.`);
    process.exit(1);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    console.error(`Error: --${name} must be a positive integer.`);
    process.exit(1);
  }

  return parsed;
}

function renderProgressBar(completed: number, total: number, width = 28): string {
  if (total <= 0) {
    return `[${'-'.repeat(width)}]`;
  }

  const filled = Math.min(width, Math.round((completed / total) * width));
  return `[${'#'.repeat(filled)}${'-'.repeat(width - filled)}]`;
}

function renderPdsSyncProgress(progress: {
  activeUsers: number;
  inactiveUsers: number;
  pagesFetched: number;
  usersSeen: number;
  profilesChecked: number;
  cacheHits: number;
  profilesFetched: number;
  profilesFailed: number;
}): string {
  const bar = renderProgressBar(progress.profilesChecked, progress.usersSeen);
  return `${bar} ${formatNumber(progress.profilesChecked)}/${formatNumber(progress.usersSeen)} profiles | pages ${formatNumber(progress.pagesFetched)} | fetched ${formatNumber(progress.profilesFetched)} | cached ${formatNumber(progress.cacheHits)} | failed ${formatNumber(progress.profilesFailed)}`;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  return `${minutes}m ${seconds}s`;
}

function renderPdsSyncSummary(result: {
  activeUsers: number;
  inactiveUsers: number;
  pds: string;
  usersSeen: number;
  pagesFetched: number;
  profilesFetched: number;
  cacheHits: number;
  profilesFailed: number;
  failedProfiles?: Array<{ active?: boolean; did: string; error: string; status?: string }>;
  cacheSize: number;
  elapsedMs: number;
}): string {
  const lines = [
    'PDS profile cache sync complete',
    renderAsciiTable({
      headers: ['Metric', 'Value'],
      rows: [
        ['PDS', result.pds],
        ['Pages scanned', formatNumber(result.pagesFetched)],
        ['Repos scanned', formatNumber(result.usersSeen)],
        ['Active repos', formatNumber(result.activeUsers)],
        ['Inactive repos', formatNumber(result.inactiveUsers)],
        ['Profiles fetched', formatNumber(result.profilesFetched)],
        ['Already cached', formatNumber(result.cacheHits)],
        ['Failed profiles', formatNumber(result.profilesFailed)],
        ['Cache entries for PDS', formatNumber(result.cacheSize)],
        ['Elapsed time', formatDuration(result.elapsedMs)],
      ],
      alignments: ['left', 'right'],
    }),
  ];

  if (result.failedProfiles !== undefined && result.failedProfiles.length > 0) {
    lines.push(
      'Failed profile fetches:',
      renderAsciiTable({
        headers: ['DID', 'State', 'Error'],
        rows: result.failedProfiles.map((failure) => [failure.did, formatRepoState(failure), failure.error]),
      })
    );
  }

  return lines.join('\n');
}

function formatRepoState(repo: { active?: boolean; status?: string }): string {
  if (repo.status !== undefined) {
    return repo.status;
  }

  if (repo.active === true) {
    return 'active';
  }

  if (repo.active === false) {
    return 'inactive';
  }

  return 'unknown';
}

function printHelp(): void {
  console.log(`wclient - CLI for the W social media platform

Usage: wclient <command> [options]

Commands:
  describe-repo <repo>          Get information about an account and repository
  get-profile <actor>           Get detailed profile view for a handle or DID
  list-records                  List records in a repository collection
  list-repos                    List repositories on the PDS
  pds sync                      Fetch PDS profiles and fill the local profile cache
  view <report>                 Render a custom report

Global Options:
  --env-file <path>             Load environment variables from a specific file
  --base-url <url>              PDS base URL (default: ${DEFAULT_PDS_URL})
  --auth                        Authenticate using W_USERNAME and W_PASSWORD
  --quiet                       Suppress non-essential CLI output
  --help                        Show this help message

Profile Options:
  --json                        Output as JSON instead of formatted table
  --with-profiles               Fetch and analyze profile data (for pds.users report)
  --profile-concurrency <n>     Number of parallel profile requests (default: 8)
  --refresh-profiles            Re-fetch profiles already present in the cache
  --clear-profile-cache         Clear the profile cache database and exit

Examples:
  wclient describe-repo alice.wsocial.network
  wclient get-profile did:plc:alice
  wclient list-records --repo alice.wsocial.network --collection app.bsky.feed.post --limit 10
  wclient list-repos
  wclient pds sync
  wclient pds sync --profile-concurrency 16
  wclient view pds.users
  wclient view pds.users --with-profiles
  wclient view pds.users --with-profiles --profile-concurrency 16
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

    case 'pds': {
      const subcommand = positional[0];
      if (subcommand !== 'sync') {
        console.error('Error: pds subcommand is required.');
        console.error('Usage: wclient pds sync [--profile-concurrency N] [--refresh-profiles] [--quiet]');
        process.exit(1);
      }

      const profileFetchConcurrency = parsePositiveIntegerFlag(flags, 'profile-concurrency');
      const quiet = flags['quiet'] === true;

      if (process.stderr.isTTY && !quiet) {
        process.stderr.write(`Syncing profile cache for ${client.getBaseUrl()}...\r`);
      }

      const result = await syncPdsProfileCache(client, {
        ...(profileFetchConcurrency !== undefined ? { profileFetchConcurrency } : {}),
        refreshProfiles: flags['refresh-profiles'] === true,
        onProgress: (progress) => {
          if (!process.stderr.isTTY || quiet) return;
          process.stderr.write(`\r${renderPdsSyncProgress(progress)}\x1b[K`);
        },
      });

      if (process.stderr.isTTY && !quiet) {
        process.stderr.write('\n');
      }

      console.log(renderPdsSyncSummary(result));
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
          const profileFetchConcurrency = parsePositiveIntegerFlag(flags, 'profile-concurrency');

          if (wantsJson) {
            const result = await getPdsUsersReport(client, {
              withProfiles: flags['with-profiles'] === true,
              ...(profileFetchConcurrency !== undefined ? { profileFetchConcurrency } : {}),
            });
            console.log(JSON.stringify(result, null, 2));
          } else {
            if (process.stderr.isTTY && !quiet) {
              process.stderr.write('Loading users...\r');
            }

            const result = await getPdsUsersReport(client, {
              withProfiles: flags['with-profiles'] === true,
              ...(profileFetchConcurrency !== undefined ? { profileFetchConcurrency } : {}),
              onProgress: ({ pagesFetched, usersSoFar, profilesFetched }) => {
                if (!process.stderr.isTTY || quiet) return;
                if (profilesFetched !== undefined) {
                  process.stderr.write(
                    `Loading users... pages: ${pagesFetched}, profiles: ${profilesFetched.toLocaleString('en-US')}\r`
                  );
                } else {
                  process.stderr.write(
                    `Loading users... pages: ${pagesFetched}, users: ${usersSoFar.toLocaleString('en-US')}\r`
                  );
                }
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
