import { build } from 'esbuild';
await build({
  entryPoints: ['apps/operator/src/main.ts'],
  outfile: 'apps/operator/dist/passdown.mjs',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  define: { __PASSDOWN_BUNDLE__: 'true' },
  legalComments: 'linked',
  external: ['pg-native', 'pg-cloudflare'],
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
});
