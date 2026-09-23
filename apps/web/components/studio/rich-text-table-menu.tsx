'use client';

import { useRef } from 'react';
import type { Editor } from '@tiptap/react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Table2, ChevronDown, Rows3, Columns3, Trash2, CornerDownRight } from 'lucide-react';
import { exitContainingBlock } from './rich-text-extensions';
import {
  menuClass,
  menuItemClass,
  menuLabelClass,
  menuSeparatorClass,
  toolClass,
} from './rich-text-styles';

export function RichTextTableMenu({ editor, disabled }: { editor: Editor; disabled: boolean }) {
  const used = useRef(false);
  const { $from } = editor.state.selection;
  let rows = 0,
    columns = 0;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === 'table') {
      rows = node.childCount;
      columns = node.firstChild?.childCount ?? 0;
      break;
    }
  }
  function run(action: () => void) {
    used.current = true;
    action();
  }
  return (
    <DropdownMenu.Root
      modal={false}
      onOpenChange={(open) => {
        if (open) used.current = false;
      }}
    >
      <DropdownMenu.Trigger asChild>
        <button type="button" className={toolClass} aria-label="Table options" disabled={disabled}>
          <Table2 size={17} aria-hidden="true" />
          <span className="max-[600px]:hidden">Table</span>
          <ChevronDown size={12} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className={menuClass}
          sideOffset={8}
          align="end"
          collisionPadding={12}
          onCloseAutoFocus={(event) => {
            if (used.current) event.preventDefault();
          }}
        >
          <DropdownMenu.Label className={menuLabelClass}>
            Table · {rows} rows × {columns} columns
          </DropdownMenu.Label>
          <DropdownMenu.Item
            className={menuItemClass}
            disabled={disabled || rows >= 51}
            onSelect={() =>
              run(() => {
                editor.chain().focus().addRowBefore().run();
              })
            }
          >
            <Rows3 size={16} />
            Insert row above
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={menuItemClass}
            disabled={disabled || rows >= 51}
            onSelect={() =>
              run(() => {
                editor.chain().focus().addRowAfter().run();
              })
            }
          >
            <Rows3 size={16} />
            Insert row below
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={menuItemClass}
            disabled={disabled || columns >= 10}
            onSelect={() =>
              run(() => {
                editor.chain().focus().addColumnBefore().run();
              })
            }
          >
            <Columns3 size={16} />
            Insert column left
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={menuItemClass}
            disabled={disabled || columns >= 10}
            onSelect={() =>
              run(() => {
                editor.chain().focus().addColumnAfter().run();
              })
            }
          >
            <Columns3 size={16} />
            Insert column right
          </DropdownMenu.Item>
          <DropdownMenu.Separator className={menuSeparatorClass} />
          <DropdownMenu.Item
            className={menuItemClass}
            onSelect={() =>
              run(() => {
                editor.chain().focus().deleteRow().run();
              })
            }
          >
            <Rows3 size={16} />
            Delete row
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={menuItemClass}
            onSelect={() =>
              run(() => {
                editor.chain().focus().deleteColumn().run();
              })
            }
          >
            <Columns3 size={16} />
            Delete column
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={menuItemClass}
            onSelect={() =>
              run(() => {
                editor.chain().focus().deleteTable().run();
              })
            }
          >
            <Trash2 size={16} />
            Delete table
          </DropdownMenu.Item>
          <DropdownMenu.Separator className={menuSeparatorClass} />
          <DropdownMenu.Item
            className={menuItemClass}
            onSelect={() =>
              run(() => {
                exitContainingBlock(editor, ['table']);
              })
            }
          >
            <CornerDownRight size={16} />
            Exit table
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
