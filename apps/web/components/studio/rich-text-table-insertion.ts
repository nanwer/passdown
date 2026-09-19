import type { Editor } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { TableMap } from '@tiptap/pm/tables';

export type TableInsertionAxis = 'row' | 'column';

/** Resolve the displayed table, independently of the editor's current caret. */
export function tablePositionFromElement(editor: Editor, table: HTMLTableElement): number | null {
  const firstCell = table.rows[0]?.cells[0];
  if (!firstCell || !editor.view.dom.contains(table)) return null;
  try {
    const position = editor.view.posAtDOM(firstCell, 0);
    const resolved = editor.state.doc.resolve(position);
    for (let depth = resolved.depth; depth > 0; depth--) {
      if (resolved.node(depth).type.name === 'table') return resolved.before(depth);
    }
  } catch {
    // A deleted/replaced table can briefly remain in an overlay's pointer state.
  }
  return null;
}

/** Insert at a zero-based table boundary in one undoable transaction. */
export function insertAtTableBoundary(
  editor: Editor,
  tablePosition: number,
  axis: TableInsertionAxis,
  boundary: number,
): boolean {
  if (
    !editor.isEditable ||
    !Number.isInteger(boundary) ||
    boundary < 0 ||
    !Number.isInteger(tablePosition) ||
    tablePosition < 0 ||
    tablePosition >= editor.state.doc.content.size
  )
    return false;
  const table = editor.state.doc.nodeAt(tablePosition);
  if (table?.type.name !== 'table') return false;
  const map = TableMap.get(table);
  const count = axis === 'row' ? map.height : map.width;
  if (boundary > count || count >= (axis === 'row' ? 51 : 10)) return false;
  const row = axis === 'row' ? Math.min(boundary, map.height - 1) : 0;
  const column = axis === 'column' ? Math.min(boundary, map.width - 1) : 0;
  const cellPosition = tablePosition + 1 + map.positionAt(row, column, table);
  const chain = editor.chain().command(({ tr }) => {
    // Selection.near also reaches paragraphs inside a panel in the target cell.
    tr.setSelection(TextSelection.near(tr.doc.resolve(cellPosition + 1), 1));
    return true;
  });
  if (axis === 'row') {
    if (boundary === count) chain.addRowAfter();
    else chain.addRowBefore();
  } else {
    if (boundary === count) chain.addColumnAfter();
    else chain.addColumnBefore();
  }
  return chain.focus().run();
}

export function nearestTableBoundary(boundaries: readonly number[], coordinate: number): number {
  let closest = 0;
  for (let index = 1; index < boundaries.length; index++) {
    if (Math.abs(boundaries[index]! - coordinate) < Math.abs(boundaries[closest]! - coordinate))
      closest = index;
  }
  return closest;
}
