// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { NewGuide } from './pages';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

for (const succeeds of [false, true]) {
  for (const movedFocus of [false, true]) {
    it(`${movedFocus ? 'preserves deliberate focus movement' : 'returns keyboard focus'} after a guide-type retry ${succeeds ? 'succeeds' : 'fails'}`, async () => {
      let typesCalls = 0;
      let finish!: (response: Response) => void;
      vi.stubGlobal(
        'fetch',
        vi.fn(async (path: string) => {
          if (path.endsWith('/session'))
            return response({
              user: { id: 'author', name: 'Author', email: 'author@example.test' },
              workspaces: [
                {
                  id: 'workshop',
                  name: 'Workshop',
                  audience: 'private',
                  role: 'manage',
                  isRoot: false,
                },
              ],
            });
          if (path.endsWith('/guide-types')) {
            if (++typesCalls === 1) return response({ error: { message: 'Unavailable' } }, 503);
            return new Promise<Response>((resolve) => {
              finish = resolve;
            });
          }
          if (path.includes('/categories')) return response({ categories: [] });
          if (path.includes('/catalog')) return response({ items: [] });
          throw new Error('Unexpected request');
        }),
      );
      render(<NewGuide workspaceId="workshop" />);
      const retry = await screen.findByRole('button', { name: 'Retry guide types' });
      fireEvent.change(screen.getByRole('textbox', { name: 'Guide title' }), {
        target: { value: 'Saved in progress' },
      });
      fireEvent.change(screen.getByRole('textbox', { name: 'Summary' }), {
        target: { value: 'Keep this summary' },
      });
      const libraryLink = screen.getByRole('link', { name: 'Library' });
      (movedFocus ? libraryLink : retry).focus();
      fireEvent.click(retry);
      expect(screen.getByText('Loading guide options…')).toHaveFocus();
      // Pointer activation in WebKit need not focus the clicked button. Returning
      // deliberately to that earlier header control must cancel focus restoration.
      if (movedFocus) libraryLink.focus();
      await act(async () =>
        finish(
          succeeds
            ? response({ types: [], composeTitles: false })
            : response({ error: { message: 'Unavailable' } }, 503),
        ),
      );
      expect(
        movedFocus
          ? libraryLink
          : succeeds
            ? screen.getByRole('textbox', { name: 'Guide title' })
            : screen.getByRole('button', { name: 'Retry guide types' }),
      ).toHaveFocus();
      expect(screen.getByRole('textbox', { name: 'Guide title' })).toHaveValue('Saved in progress');
      expect(screen.getByRole('textbox', { name: 'Summary' })).toHaveValue('Keep this summary');
    });
  }
}
