import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  // @poker/shared is published as TypeScript source, so it must be bundled in.
  // Every other dependency stays external and is resolved from node_modules at runtime.
  noExternal: [/^@poker\//],
});
