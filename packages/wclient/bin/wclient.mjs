#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const binDir = dirname(fileURLToPath(import.meta.url));
const cliPath = resolve(binDir, '../dist/cli.mjs');

if (!existsSync(cliPath)) {
  console.error('wclient CLI is not built yet. Run "pnpm --filter wclient build" in this workspace and try again.');
  process.exit(1);
}

await import(pathToFileURL(cliPath).href);
