// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { EditorContent, useEditor } from '@tiptap/react';
import type { Editor, JSONContent } from '@tiptap/core';
import { createInstructionExtensions } from './rich-text-extensions';

beforeAll(() => {
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});
afterEach(cleanup);

const paragraph = (text: string): JSONContent => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});
const panel: JSONContent = {
  type: 'panel',
  attrs: { tone: 'info' },
  content: [paragraph('Disconnect power before servicing.')],
};

async function setup(content: JSONContent) {
  let instance: Editor | null = null;
  function Harness() {
    const editor = useEditor({ extensions: createInstructionExtensions(), content });
    instance = editor;
    return (
      <>
        <EditorContent editor={editor} />
        <button type="button">Outside editor</button>
      </>
    );
  }
  render(<Harness />);
  await waitFor(() => expect(instance).not.toBeNull());
  const editor = instance as unknown as Editor;
  let panelPosition = -1;
  editor.state.doc.descendants((node, position) => {
    if (node.type.name === 'panel') panelPosition = position;
  });
  act(() => {
    editor.commands.setTextSelection(panelPosition + 4);
    editor.view.focus();
  });
  await screen.findByRole('button', { name: 'Panel type' });
  return { editor, panelPosition };
}

describe('contextual rich-text panel controls', () => {
  it('edits the panel type without moving the selection or adding control labels to the document', async () => {
    const { editor, panelPosition } = await setup({
      type: 'doc',
      content: [panel, paragraph('Continue.')],
    });
    act(() => editor.commands.setTextSelection({ from: panelPosition + 3, to: panelPosition + 9 }));
    const before = editor.state.selection.toJSON();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Panel type' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Note' }));
    await waitFor(() =>
      expect(screen.getByRole('group', { name: 'Note panel' })).toHaveAttribute(
        'data-tone',
        'note',
      ),
    );
    expect(editor.state.selection.toJSON()).toEqual(before);
    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: 'panel',
      attrs: { tone: 'note' },
      content: panel.content,
    });
    expect(editor.state.doc.textContent).toBe('Disconnect power before servicing.Continue.');
    expect(
      screen.getByRole('toolbar', { name: 'Panel controls' }).closest('[contenteditable]'),
    ).toBeNull();
    act(() => editor.commands.undo());
    await waitFor(() =>
      expect(screen.getByRole('group', { name: 'Info panel' })).toBeInTheDocument(),
    );
  });

  it('removes panel styling inside a table cell while preserving its text and table', async () => {
    const { editor } = await setup({
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [panel] },
                { type: 'tableCell', content: [paragraph('Next cell')] },
              ],
            },
          ],
        },
      ],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Remove panel style' }));
    await waitFor(() =>
      expect(screen.queryByRole('group', { name: 'Info panel' })).not.toBeInTheDocument(),
    );
    expect(editor.getJSON().content?.[0]?.type).toBe('table');
    expect(editor.getJSON()).toMatchObject({
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [paragraph('Disconnect power before servicing.')] },
                { type: 'tableCell', content: [paragraph('Next cell')] },
              ],
            },
          ],
        },
      ],
    });
    expect(editor.state.doc.textContent).toBe('Disconnect power before servicing.Next cell');
  });

  it('continues outside the panel without losing content and dismisses its controls', async () => {
    const { editor } = await setup({ type: 'doc', content: [panel] });
    fireEvent.click(screen.getByRole('button', { name: 'Exit panel' }));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Panel type' })).not.toBeInTheDocument(),
    );
    expect(editor.isActive('panel')).toBe(false);
    expect(editor.getJSON().content?.map((node) => node.type)).toEqual(['panel', 'paragraph']);
    expect(editor.state.doc.textContent).toBe('Disconnect power before servicing.');
  });
});
