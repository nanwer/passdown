// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor, type JSONContent } from '@tiptap/core';
import { bodyToEditorDocument, editorDocumentToBody } from '@guide/content';
import {
  createInstructionExtensions,
  exitContainingBlock,
  insertPanel,
  inspectInstructionPaste,
  unwrapPanel,
} from './rich-text-extensions';

const editors: Editor[] = [];
function editor(content: object = { type: 'doc', content: [{ type: 'paragraph' }] }) {
  const instance = new Editor({ extensions: createInstructionExtensions(), content });
  editors.push(instance);
  return instance;
}
afterEach(() => editors.splice(0).forEach((instance) => instance.destroy()));

describe('visual instruction editing', () => {
  it('turns the current paragraph into an editable panel and changes tone without nesting', () => {
    const instance = editor({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Switch off power' }] }],
    });
    instance.commands.setTextSelection(5);
    expect(insertPanel(instance, 'info')).toBe(true);
    expect(insertPanel(instance, 'warning')).toBe(true);
    const panel = instance.getJSON().content?.[0];
    expect(panel?.type).toBe('panel');
    expect(panel?.attrs?.tone).toBe('warning');
    expect(panel?.content?.[0]?.type).toBe('paragraph');
    expect(instance.getText().trim()).toBe('Switch off power');
    expect(() => editorDocumentToBody(instance.getJSON())).not.toThrow();
    expect(unwrapPanel(instance)).toBe(true);
    expect(instance.getJSON().content?.[0]?.type).toBe('paragraph');
    expect(instance.getText()).toBe('Switch off power');
  });

  it('inserts a panel inside an actual table cell and exits within that cell', () => {
    const instance = editor();
    instance.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });
    expect(insertPanel(instance, 'note')).toBe(true);
    const table: JSONContent | undefined = (instance.getJSON() as JSONContent).content?.find(
      (node) => node.type === 'table',
    );
    expect(table?.content?.[0]?.content?.[0]?.content?.[0]?.type).toBe('panel');
    expect(exitContainingBlock(instance, ['panel'])).toBe(true);
    const cell = (instance.getJSON() as JSONContent).content?.[0]?.content?.[0]?.content?.[0];
    expect(cell?.content?.map((node) => node.type)).toEqual(['panel', 'paragraph']);
    expect(instance.isActive('panel')).toBe(false);
    expect(instance.isActive('table')).toBe(true);
    expect(() => editorDocumentToBody(instance.getJSON())).not.toThrow();
  });

  it('preserves combined code and emphasis and ordinary rich paste', () => {
    const instance = editor({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Careful', marks: [{ type: 'bold' }, { type: 'code' }] }],
        },
      ],
    });
    instance.commands.setTextSelection({ from: 1, to: 8 });
    instance.commands.toggleItalic();
    expect(
      instance
        .getJSON()
        .content?.[0]?.content?.[0]?.marks?.map((mark) => mark.type)
        .sort(),
    ).toEqual(['bold', 'code', 'italic']);
    expect(inspectInstructionPaste('<p><strong>Bold</strong> and <em>italic</em></p>')).toBeNull();
  });

  it('preserves legacy table alignment when opening and editing visual content', () => {
    const legacy = bodyToEditorDocument([
      {
        type: 'table',
        headers: [[{ type: 'text', text: 'Count', marks: [] }]],
        rows: [[[{ type: 'text', text: '2', marks: [] }]]],
        align: ['right'],
      },
    ]);
    const instance = editor(legacy);
    const normalized = editorDocumentToBody(instance.getJSON());
    expect(normalized).toEqual([{ type: 'richText', document: legacy }]);
    expect(instance.getHTML()).toContain('text-align: right');
  });

  it('rejects unsupported pasted media, nested tables, merged cells and active content explicitly', () => {
    expect(inspectInstructionPaste('<p>Caption</p><img src="x">')).toMatch(/images/i);
    expect(inspectInstructionPaste('<table><tr><td colspan="2">A</td></tr></table>')).toMatch(
      /merged/i,
    );
    expect(
      inspectInstructionPaste(
        '<table><tr><td><table><tr><td>A</td></tr></table></td></tr></table>',
      ),
    ).toMatch(/nested tables/i);
    expect(inspectInstructionPaste('<p onclick="alert(1)">Text</p>')).toMatch(/active/i);
    expect(inspectInstructionPaste('<p><a href="javascript:alert(1)">Unsafe</a></p>')).toMatch(
      /link/i,
    );
  });
});
