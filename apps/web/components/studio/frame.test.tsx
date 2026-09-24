// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { SessionGate } from './frame';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

for (const count of [1, 2]) {
  it(`names the studio entry correctly for ${count} accessible workspace(s)`, async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            user: { id: 'author', name: 'Author', email: 'author@example.test' },
            workspaces: Array.from({ length: count }, (_, index) => ({
              id: `workspace-${index}`,
              name: `Workspace ${index}`,
              audience: 'public',
              role: 'manage',
            })),
          }),
        ),
      ),
    );
    render(<SessionGate workspaceId="workspace-0">{() => <p>Ready</p>}</SessionGate>);
    await screen.findByText('Ready');
    expect(
      screen.getByRole('link', { name: count === 1 ? /^Studio$/ : /^Workspaces$/ }),
    ).toHaveAttribute('href', '/studio');
    expect(
      screen.queryByRole('link', { name: count === 1 ? /^Workspaces$/ : /^Studio$/ }),
    ).not.toBeInTheDocument();
  });
}
