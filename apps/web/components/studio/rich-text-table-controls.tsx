'use client';

import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Editor } from '@tiptap/react';
import { Plus } from 'lucide-react';
import {
  insertAtTableBoundary,
  nearestTableBoundary,
  tablePositionFromElement,
  type TableInsertionAxis,
} from './rich-text-table-insertion';

type Point = { x: number; y: number };
type Target = { table: HTMLTableElement; point: Point };
type Geometry = {
  table: HTMLTableElement;
  row: number;
  column: number;
  rows: number;
  columns: number;
  rowY: number;
  columnX: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  showRow: boolean;
  showColumn: boolean;
};

function readGeometry({ table, point }: Target): Geometry | null {
  if (!table.isConnected || !table.rows.length || !table.rows[0]?.cells.length) return null;
  const rect = table.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const wrapper = table.closest('.tableWrapper')?.getBoundingClientRect() ?? rect;
  const root = table.closest('.rte-canvas')?.getBoundingClientRect() ?? rect;
  const left = Math.max(rect.left, wrapper.left, root.left, 16);
  const right = Math.min(rect.right, wrapper.right, root.right, window.innerWidth - 16);
  const top = Math.max(rect.top, root.top, 16);
  // A cell can be fully visible with its border on the viewport edge. Keep its
  // insertion affordance available and inset the handle, rather than hiding it.
  const bottom = Math.min(rect.bottom, root.bottom, window.innerHeight);
  if (left >= right || top >= bottom) return null;
  const rowBounds = [
    rect.top,
    ...Array.from(table.rows, (row) => row.getBoundingClientRect().bottom),
  ];
  const rtl = getComputedStyle(table).direction === 'rtl';
  const columnBounds = [
    rtl ? rect.right : rect.left,
    ...Array.from(table.rows[0].cells, (cell) => {
      const cellRect = cell.getBoundingClientRect();
      return rtl ? cellRect.left : cellRect.right;
    }),
  ];
  const row = nearestTableBoundary(rowBounds, point.y);
  const column = nearestTableBoundary(columnBounds, point.x);
  const rowY = rowBounds[row]!;
  const columnX = columnBounds[column]!;
  return {
    table,
    row,
    column,
    rows: table.rows.length,
    columns: table.rows[0].cells.length,
    rowY,
    columnX,
    left,
    right,
    top,
    bottom,
    showRow: rowY >= top - 1 && rowY <= bottom + 1,
    showColumn: rect.top >= top - 1 && columnX >= left - 1 && columnX <= right + 1,
  };
}

/** Ephemeral table chrome: no controls or positioning data enters the guide document. */
export function RichTextTableControls({
  editor,
  disabled = false,
}: {
  editor: Editor | null;
  disabled?: boolean;
}) {
  const [geometry, setGeometry] = useState<Geometry | null>(null);
  const [emphasis, setEmphasis] = useState<TableInsertionAxis | null>(null);
  const target = useRef<Target | null>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const clear = () => {
    target.current = null;
    setGeometry(null);
    setEmphasis(null);
  };

  useEffect(() => {
    if (!editor || disabled) {
      clear();
      return;
    }
    const dom = editor.view.dom;
    const refresh = () => {
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        if (!target.current || !dom.contains(target.current.table)) {
          setGeometry(null);
          return;
        }
        setGeometry(readGeometry(target.current));
      });
    };
    const tableFor = (element: Element | null) => {
      // Overlay scrollbars can report the wrapper as the pointer target even
      // when the pointer is over a visible cell boundary (notably in WebKit).
      const table = element?.matches('.tableWrapper')
        ? element.querySelector<HTMLTableElement>(':scope > table')
        : element?.closest<HTMLTableElement>('table');
      return table && dom.contains(table) ? table : null;
    };
    const pointer = (event: PointerEvent) => {
      const element = event.target instanceof Element ? event.target : null;
      if (element && overlay.current?.contains(element)) return;
      const point = { x: event.clientX, y: event.clientY };
      const table = tableFor(element);
      if (table) {
        target.current = { table, point };
        setEmphasis(null);
        refresh();
        return;
      }
      const current = target.current;
      if (current) {
        const rect = current.table.getBoundingClientRect();
        const wrapper = current.table.closest('.tableWrapper')?.getBoundingClientRect() ?? rect;
        if (
          point.x >= Math.max(rect.left, wrapper.left) - 28 &&
          point.x <= Math.min(rect.right, wrapper.right) + 20 &&
          point.y >= rect.top - 28 &&
          point.y <= rect.bottom + 20
        ) {
          target.current = { table: current.table, point };
          refresh();
          return;
        }
      }
      clear();
    };
    const touch = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return;
      const cell =
        event.target instanceof Element
          ? event.target.closest<HTMLTableCellElement>('td,th')
          : null;
      const table = tableFor(cell);
      if (!cell || !table) return;
      const rect = cell.getBoundingClientRect();
      target.current = { table, point: { x: rect.right, y: rect.bottom } };
      refresh();
    };
    const selection = () => {
      if (!editor.isFocused) return;
      const node = editor.view.domAtPos(editor.state.selection.from).node;
      const element = node instanceof Element ? node : node.parentElement;
      const cell = element?.closest<HTMLTableCellElement>('td,th');
      const table = tableFor(cell ?? null);
      if (!cell || !table) return clear();
      // Pointer-driven positioning remains anchored within the selected table.
      if (target.current?.table === table) return refresh();
      const rect = cell.getBoundingClientRect();
      target.current = { table, point: { x: rect.right, y: rect.bottom } };
      refresh();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') clear();
    };
    const leave = () => clear();
    const focus = (event: FocusEvent) => {
      const element = event.target;
      if (
        element instanceof globalThis.Node &&
        !dom.contains(element) &&
        !overlay.current?.contains(element)
      )
        clear();
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(refresh);
    observer?.observe(dom);
    document.addEventListener('pointermove', pointer);
    dom.addEventListener('pointerdown', touch);
    document.addEventListener('keydown', escape);
    document.addEventListener('focusin', focus);
    document.documentElement.addEventListener('pointerleave', leave);
    window.addEventListener('scroll', refresh, true);
    window.addEventListener('resize', refresh);
    editor.on('selectionUpdate', selection);
    editor.on('transaction', refresh);
    return () => {
      cancelAnimationFrame(frame.current);
      observer?.disconnect();
      document.removeEventListener('pointermove', pointer);
      dom.removeEventListener('pointerdown', touch);
      document.removeEventListener('keydown', escape);
      document.removeEventListener('focusin', focus);
      document.documentElement.removeEventListener('pointerleave', leave);
      window.removeEventListener('scroll', refresh, true);
      window.removeEventListener('resize', refresh);
      editor.off('selectionUpdate', selection);
      editor.off('transaction', refresh);
    };
  }, [editor, disabled]);

  if (!editor || !geometry || disabled) return null;
  function insert(axis: TableInsertionAxis, event: MouseEvent<HTMLButtonElement>) {
    if (!editor || !geometry) return;
    const fresh = target.current ? readGeometry(target.current) : null;
    if (!fresh || fresh.table !== geometry.table) return clear();
    // A browser can scroll between pointer movement and click delivery. Never
    // let a handle's old screen position insert into a cell now underneath it.
    if (event.detail > 0) {
      const x = axis === 'row' ? Math.max(14, fresh.left - 13) : fresh.columnX;
      const y =
        axis === 'row'
          ? Math.min(Math.max(14, fresh.rowY), window.innerHeight - 14)
          : Math.max(14, fresh.top - 13);
      if (
        Math.abs(event.clientX - x) > 16 ||
        Math.abs(event.clientY - y) > 16 ||
        fresh[axis] !== geometry[axis]
      )
        return clear();
    }
    const position = tablePositionFromElement(editor, geometry.table);
    if (position !== null)
      insertAtTableBoundary(
        editor,
        position,
        axis,
        axis === 'row' ? geometry.row : geometry.column,
      );
    clear();
  }

  return createPortal(
    <div
      ref={overlay}
      className="pointer-events-none fixed inset-0 z-[42]"
      data-table-insertion-controls=""
      role="group"
      aria-label="Table insertion controls"
    >
      {geometry.showRow && (
        <>
          <div
            aria-hidden="true"
            className={`rte-table-insertion-line--row absolute bg-focus pointer-events-none h-0.5 [transform:translateY(-1px)] ${emphasis === 'row' ? 'is-emphasized opacity-100' : 'opacity-[0.28]'}`}
            style={{
              left: geometry.left,
              top: Math.min(geometry.rowY, window.innerHeight - 1),
              width: geometry.right - geometry.left,
            }}
          />
          <button
            type="button"
            className="absolute grid size-6 place-items-center rounded-[50%] border border-solid border-focus bg-editor-canvas p-0 text-focus [box-shadow:0_2px_7px_#1018281a] [transform:translate(-50%,-50%)] cursor-pointer pointer-events-auto hover:bg-action hover:text-action-ink hover:[outline:2px_solid_var(--gp-semantic-focus-ring)] hover:outline-offset-[2px] focus-visible:bg-action focus-visible:text-action-ink focus-visible:[outline:2px_solid_var(--gp-semantic-focus-ring)] focus-visible:outline-offset-[2px] disabled:cursor-default disabled:border-editor-line disabled:bg-editor-canvas disabled:text-editor-muted disabled:[box-shadow:none] pointer-coarse:size-7.5"
            aria-label={`Insert row at position ${geometry.row + 1}`}
            title={
              geometry.rows >= 51 ? 'Maximum 51 rows' : `Insert row at position ${geometry.row + 1}`
            }
            disabled={geometry.rows >= 51}
            style={{
              left: Math.max(14, geometry.left - 13),
              top: Math.min(Math.max(14, geometry.rowY), window.innerHeight - 14),
            }}
            onPointerEnter={() => setEmphasis('row')}
            onFocus={() => setEmphasis('row')}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => insert('row', event)}
          >
            <Plus size={15} aria-hidden="true" />
          </button>
        </>
      )}
      {geometry.showColumn && (
        <>
          <div
            aria-hidden="true"
            className={`rte-table-insertion-line--column absolute bg-focus pointer-events-none w-0.5 [transform:translateX(-1px)] ${emphasis === 'column' ? 'is-emphasized opacity-100' : 'opacity-[0.28]'}`}
            style={{
              left: geometry.columnX,
              top: geometry.top,
              height: geometry.bottom - geometry.top,
            }}
          />
          <button
            type="button"
            className="absolute grid size-6 place-items-center rounded-[50%] border border-solid border-focus bg-editor-canvas p-0 text-focus [box-shadow:0_2px_7px_#1018281a] [transform:translate(-50%,-50%)] cursor-pointer pointer-events-auto hover:bg-action hover:text-action-ink hover:[outline:2px_solid_var(--gp-semantic-focus-ring)] hover:outline-offset-[2px] focus-visible:bg-action focus-visible:text-action-ink focus-visible:[outline:2px_solid_var(--gp-semantic-focus-ring)] focus-visible:outline-offset-[2px] disabled:cursor-default disabled:border-editor-line disabled:bg-editor-canvas disabled:text-editor-muted disabled:[box-shadow:none] pointer-coarse:size-7.5"
            aria-label={`Insert column at position ${geometry.column + 1}`}
            title={
              geometry.columns >= 10
                ? 'Maximum 10 columns'
                : `Insert column at position ${geometry.column + 1}`
            }
            disabled={geometry.columns >= 10}
            style={{ left: geometry.columnX, top: Math.max(14, geometry.top - 13) }}
            onPointerEnter={() => setEmphasis('column')}
            onFocus={() => setEmphasis('column')}
            onMouseDown={(event) => event.preventDefault()}
            onClick={(event) => insert('column', event)}
          >
            <Plus size={15} aria-hidden="true" />
          </button>
        </>
      )}
    </div>,
    document.body,
  );
}
