import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/playground.ts'],
  format: 'esm',
  outDir: '.playground',
  clean: true,
  sourcemap: true,
});