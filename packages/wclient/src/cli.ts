import { DEFAULT_PDS_URL, WClient } from './wclient.js';

const rawArgs = process.argv.slice(2).filter((arg) => arg !== '--');
const [command, ...rest] = rawArgs;

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
  --base-url <url>              PDS base URL (default: ${DEFAULT_PDS_URL})
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
    typeof flags['base-url'] === 'string' ? flags['base-url'] : undefined;
  const client = new WClient(baseUrl ? { baseUrl } : {});

  switch (command) {
    case 'describe-repo': {
      const repo =
        positional[0] ??
        (typeof flags['repo'] === 'string' ? flags['repo'] : undefined);
      if (!repo) {
        console.error('Error: <repo> argument is required.');
        console.error('Usage: wclient describe-repo <repo>');
        process.exit(1);
      }
      const result = await client.repo.describeRepo(repo);
      console.log(JSON.stringify(result, null, 2));
      break;
    }

    case 'list-records': {
      const repo =
        typeof flags['repo'] === 'string' ? flags['repo'] : undefined;
      const collection =
        typeof flags['collection'] === 'string'
          ? flags['collection']
          : undefined;
      if (!repo || !collection) {
        console.error('Error: --repo and --collection are required.');
        console.error(
          'Usage: wclient list-records --repo <repo> --collection <nsid> [--limit N] [--cursor X] [--reverse]',
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
