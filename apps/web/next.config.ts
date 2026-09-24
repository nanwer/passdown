import type { NextConfig } from 'next';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspaceRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const config: NextConfig = {
  poweredByHeader: false,
  output: process.env.GUIDE_NEXT_OUTPUT === 'standalone' ? 'standalone' : undefined,
  outputFileTracingRoot: workspaceRoot,
  turbopack: { root: workspaceRoot },
  distDir: process.env.GUIDE_NEXT_DIST_DIR || '.next',
  serverExternalPackages: ['better-auth', 'pg'],
  /**
   * Uploaded pictures are runtime data, not part of the build.
   *
   * The media root is resolved from an environment variable, so the tracer
   * cannot see where it points and walks the directory it finds beside the
   * application — pulling every locally uploaded image into the route's file
   * trace. A deployment built from that trace ships one installation's photos.
   *
   * Excluded explicitly, because the tracer has no other way to know that a
   * path decided at runtime is not an application dependency.
   */
  outputFileTracingExcludes: {
    '**': [
      '**/.media/**',
      '**/.media-authoring/**',
      '**/.media-*/**',
      // Application source is compiled into .next; it is never runtime data.
      './**/*.md',
      './**/*.ts',
      './**/*.tsx',
      '../../packages/**/*.ts',
      '../../packages/**/*.tsx',
    ],
  },
  transpilePackages: [
    '@guide/content',
    '@guide/contracts',
    '@guide/database',
    '@guide/core',
    '@guide/testing',
    '@guide/ui',
    '@guide/guide-ui',
  ],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'same-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Cache-Control', value: 'private, no-store' },
        ],
      },
    ];
  },
};
export default config;
