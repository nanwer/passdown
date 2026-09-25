import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';

// People paste the file the install guide shows, so it must be the real one.
it('shows the exact deploy/compose.yaml in the install guide', () => {
  const guide = readFileSync(resolve('docs/self-hosting/install.md'), 'utf8');
  const section = guide.slice(guide.indexOf('## The compose file'));
  const shown = section.match(/```yaml\n([\s\S]*?)```/)?.[1];
  expect(shown).toBe(readFileSync(resolve('deploy/compose.yaml'), 'utf8'));
});

it('pastes into Portainer as-is: no settings file, name, build or host folder', () => {
  const compose = readFileSync(resolve('deploy/compose.yaml'), 'utf8');
  expect(compose).not.toMatch(/^name:/m);
  expect(compose).not.toMatch(/env_file|build:|\$\{[A-Z_]+:\?/);
  // Every volume is named; nothing from the host is mounted.
  for (const [, source] of compose.matchAll(/^\s+- ([^:\s]+):\/[^\n]*$/gm))
    expect(source).toMatch(/^[a-z-]+$/);
  // One published port, and it is HTTPS.
  expect(compose.match(/ports:/g)).toHaveLength(1);
  expect(compose).toContain("ports: ['${PASSDOWN_PORT:-8443}:443']");
});
