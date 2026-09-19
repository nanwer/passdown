// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { Editor, type JSONContent } from '@tiptap/core';
import { createInstructionExtensions } from './rich-text-extensions';
import {
  insertAtTableBoundary,
  nearestTableBoundary,
  tablePositionFromElement,
} from './rich-text-table-insertion';

const editors: Editor[] = [];
const paragraph = (text: string): JSONContent => ({
  type: 'paragraph',
  content: [{ type: 'text', text }],
});
function table(prefix: string, rows = 2, columns = 2): JSONContent {
  return {
    type: 'table',
    content: Array.from({ length: rows }, (_, row) => ({
      type: 'tableRow',
      content: Array.from({ length: columns }, (_, column) => ({
        type: row === 0 ? 'tableHeader' : 'tableCell',
        content: [paragraph(`${prefix}${row}${column}`)],
      })),
    })),
  };
}
function setup(content: JSONContent[]) {
  const instance = new Editor({
    extensions: createInstructionExtensions(),
    content: { type: 'doc', content },
  });
  editors.push(instance);
  return instance;
}
afterEach(() => editors.splice(0).forEach((instance) => instance.destroy()));

describe('inserting at visible table boundaries', () => {
  for (const axis of ['row', 'column'] as const) {
    for (const boundary of [0, 1, 2]) {
      it(`inserts ${axis} at boundary ${boundary}, preserving cells and undo/redo`, () => {
        const instance = setup([table('A')]);
        const before = instance.getJSON();
        expect(insertAtTableBoundary(instance, 0, axis, boundary)).toBe(true);
        const after = instance.getJSON();
        const rows = instance.state.doc.firstChild!;
        const cells: string[][] = [];
        rows.forEach((row) => {
          const content: string[] = [];
          row.forEach((cell) => content.push(cell.textContent));
          cells.push(content);
        });
        if (axis === 'row') {
          expect(cells).toEqual([
            ...[
              ['A00', 'A01'],
              ['A10', 'A11'],
            ].slice(0, boundary),
            ['', ''],
            ...[
              ['A00', 'A01'],
              ['A10', 'A11'],
            ].slice(boundary),
          ]);
        } else {
          expect(cells).toEqual(
            [
              ['A00', 'A01'],
              ['A10', 'A11'],
            ].map((row) => [...row.slice(0, boundary), '', ...row.slice(boundary)]),
          );
        }
        expect(instance.commands.undo()).toBe(true);
        expect(instance.getJSON()).toEqual(before);
        expect(instance.commands.redo()).toBe(true);
        expect(instance.getJSON()).toEqual(after);
      });
    }
  }

  it('targets a hovered second table while the caret stays in the first table', () => {
    const instance = setup([table('A'), paragraph('Between'), table('B')]);
    const second = instance.view.dom.querySelectorAll('table')[1]!;
    const position = tablePositionFromElement(instance, second);
    expect(position).not.toBeNull();
    instance.commands.setTextSelection(4);
    const first = instance.state.doc.firstChild!.toJSON();
    expect(insertAtTableBoundary(instance, position!, 'column', 1)).toBe(true);
    expect(instance.state.doc.firstChild!.toJSON()).toEqual(first);
    expect(instance.state.doc.lastChild!.firstChild!.childCount).toBe(3);
    expect(instance.state.doc.lastChild!.textContent).toBe('B00B01B10B11');
  });

  it('rejects stale positions, out-of-range boundaries, read-only edits and content caps', () => {
    const instance = setup([table('A', 51, 10)]);
    const original = instance.getJSON();
    expect(insertAtTableBoundary(instance, 0, 'row', 51)).toBe(false);
    expect(insertAtTableBoundary(instance, 0, 'column', 10)).toBe(false);
    expect(insertAtTableBoundary(instance, 0, 'row', 99)).toBe(false);
    expect(insertAtTableBoundary(instance, -1, 'row', 0)).toBe(false);
    expect(insertAtTableBoundary(instance, 1, 'row', 0)).toBe(false);
    expect(instance.getJSON()).toEqual(original);
    const small = setup([table('B')]);
    small.setEditable(false);
    expect(insertAtTableBoundary(small, 0, 'row', 0)).toBe(false);
  });

  it('chooses internal and outer boundaries in either visual direction', () => {
    expect(nearestTableBoundary([100, 200, 300], 98)).toBe(0);
    expect(nearestTableBoundary([100, 200, 300], 204)).toBe(1);
    expect(nearestTableBoundary([100, 200, 300], 302)).toBe(2);
    expect(nearestTableBoundary([300, 200, 100], 98)).toBe(2);
  });
});
