import { defineConfig } from 'tsdown';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: 'esm',
    outDir: 'dist',
    clean: true,
    sourcemap: true,
  },
  {
    entry: ['src/cli.ts'],
    format: 'esm',
    outDir: 'dist',
    banner: '#!/usr/bin/env node',
    sourcemap: true,
  },
]);
