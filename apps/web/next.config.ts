import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
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
    '**': ['**/.media/**', '**/.media-authoring/**', '**/.media-*/**'],
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
