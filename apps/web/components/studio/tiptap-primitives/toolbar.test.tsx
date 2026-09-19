// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Toolbar, ToolbarGroup } from './toolbar';

afterEach(cleanup);

it('keeps one toolbar tab stop and moves by arrow keys past disabled commands', async () => {
  render(
    <Toolbar>
      <ToolbarGroup>
        <button type="button">Style</button>
        <button type="button" disabled>
          Unavailable
        </button>
      </ToolbarGroup>
      <ToolbarGroup>
        <button type="button">Bold</button>
        <button type="button">Insert</button>
      </ToolbarGroup>
    </Toolbar>,
  );
  const style = screen.getByRole('button', { name: 'Style' });
  const bold = screen.getByRole('button', { name: 'Bold' });
  const insert = screen.getByRole('button', { name: 'Insert' });
  expect(style.tabIndex).toBe(0);
  expect(bold.tabIndex).toBe(-1);
  style.focus();
  fireEvent.keyDown(style, { key: 'ArrowRight' });
  expect(document.activeElement).toBe(bold);
  expect(bold.tabIndex).toBe(0);
  expect(style.tabIndex).toBe(-1);
  fireEvent.keyDown(bold, { key: 'End' });
  expect(document.activeElement).toBe(insert);
  fireEvent.keyDown(insert, { key: 'ArrowRight' });
  expect(document.activeElement).toBe(style);
  style.setAttribute('disabled', '');
  await waitFor(() => expect(bold.tabIndex).toBe(0));
});
