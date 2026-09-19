'use client';

import { useRef, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  List,
  ListOrdered,
  Quote,
  Link,
  Undo2,
  Redo2,
  Plus,
  ChevronDown,
  Table2,
  Check,
  Pilcrow,
} from 'lucide-react';
import { insertPanel, panelTypes } from './rich-text-extensions';
import { Toolbar, ToolbarGroup } from './tiptap-primitives/toolbar';
import './rich-text-toolbar.css';

interface RichTextToolbarProps {
  editor: Editor | null;
  disabled: boolean;
  onLinkRequest(): void;
  context?: ReactNode;
}

function Tool({
  label,
  shortcut,
  children,
  active,
  disabled,
  onClick,
}: {
  label: string;
  shortcut?: string;
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick(): void;
}) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className="rte-tool"
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClick}
        >
          {children}
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="rte-composer-tooltip" sideOffset={8} collisionPadding={8}>
          <span>{label}</span>
          {shortcut && <kbd>{shortcut}</kbd>}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

const panelDescriptions = {
  info: 'Helpful context',
  note: 'Something to remember',
  success: 'Expected result',
  warning: 'Proceed with care',
  danger: 'Stop and check',
  decision: 'A choice to make',
};

function TextStyleMenu({ editor, disabled }: Pick<RichTextToolbarProps, 'editor' | 'disabled'>) {
  const changed = useRef(false);
  const level = editor?.isActive('heading') ? Number(editor.getAttributes('heading').level) : 0;
  return (
    <DropdownMenu.Root
      modal={false}
      onOpenChange={(open) => {
        if (open) changed.current = false;
      }}
    >
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="rte-tool rte-tool--text-style"
          aria-label="Text style"
          disabled={disabled}
        >
          <span>{level ? `Heading ${level}` : 'Normal text'}</span>
          <ChevronDown size={13} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="rte-composer-menu rte-composer-menu--styles"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          aria-label="Text style"
          onCloseAutoFocus={(event) => {
            if (changed.current) event.preventDefault();
          }}
        >
          <DropdownMenu.Label className="rte-composer-menu-label">Text style</DropdownMenu.Label>
          <DropdownMenu.Item
            className="rte-composer-menu-item"
            onSelect={() => {
              changed.current = true;
              editor?.chain().focus().setParagraph().run();
            }}
          >
            <Pilcrow size={17} aria-hidden="true" />
            <span>Normal text</span>
            {!level && <Check className="rte-menu-check" size={16} aria-hidden="true" />}
          </DropdownMenu.Item>
          {[1, 2, 3, 4, 5, 6].map((heading) => (
            <DropdownMenu.Item
              key={heading}
              className="rte-composer-menu-item"
              onSelect={() => {
                changed.current = true;
                editor
                  ?.chain()
                  .focus()
                  .setHeading({ level: heading as 1 | 2 | 3 | 4 | 5 | 6 })
                  .run();
              }}
            >
              <span className="rte-heading-symbol" aria-hidden="true">
                H<small>{heading}</small>
              </span>
              <span className={`rte-heading-preview rte-heading-preview--${heading}`}>
                Heading {heading}
              </span>
              {level === heading && (
                <Check className="rte-menu-check" size={16} aria-hidden="true" />
              )}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function InsertMenu({ editor, disabled }: Pick<RichTextToolbarProps, 'editor' | 'disabled'>) {
  const changed = useRef(false);
  const insert = (command: () => void) => {
    changed.current = true;
    command();
  };
  return (
    <DropdownMenu.Root
      modal={false}
      onOpenChange={(open) => {
        if (open) changed.current = false;
      }}
    >
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="rte-tool rte-tool--insert"
          aria-label="Insert elements"
          disabled={disabled}
        >
          <Plus size={17} aria-hidden="true" />
          <span>Insert</span>
          <ChevronDown size={12} aria-hidden="true" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="rte-composer-menu rte-composer-menu--insert"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          aria-label="Insert elements"
          onCloseAutoFocus={(event) => {
            if (changed.current) event.preventDefault();
          }}
        >
          <DropdownMenu.Label className="rte-composer-menu-label">Panels</DropdownMenu.Label>
          {panelTypes.map(({ tone, label, Icon }) => (
            <DropdownMenu.Item
              className="rte-composer-menu-item rte-composer-menu-item--panel"
              key={tone}
              aria-label={`${label} panel`}
              onSelect={() =>
                insert(() => {
                  if (editor) insertPanel(editor, tone);
                })
              }
            >
              <span className={`rte-menu-panel-icon rte-menu-panel-icon--${tone}`}>
                <Icon size={18} aria-hidden="true" />
              </span>
              <span className="rte-menu-item-copy">
                <span>{label} panel</span>
                <small>{panelDescriptions[tone]}</small>
              </span>
            </DropdownMenu.Item>
          ))}
          <DropdownMenu.Separator className="rte-composer-menu-separator" />
          <DropdownMenu.Item
            className="rte-composer-menu-item"
            aria-label="Table"
            disabled={editor?.isActive('table')}
            onSelect={() =>
              insert(() => {
                editor
                  ?.chain()
                  .focus()
                  .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
                  .run();
              })
            }
          >
            <Table2 size={18} aria-hidden="true" />
            <span>Table</span>
            <small className="rte-menu-meta">3 × 3</small>
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="rte-composer-menu-item"
            onSelect={() =>
              insert(() => {
                editor?.chain().focus().toggleBlockquote().run();
              })
            }
          >
            <Quote size={18} aria-hidden="true" />
            <span>Quote</span>
            {editor?.isActive('blockquote') && (
              <Check className="rte-menu-check" size={16} aria-hidden="true" />
            )}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function RichTextToolbar({
  editor,
  disabled,
  onLinkRequest,
  context,
}: RichTextToolbarProps) {
  const unavailable = disabled || !editor;
  return (
    <Tooltip.Provider delayDuration={400} skipDelayDuration={100}>
      <Toolbar>
        <ToolbarGroup aria-label="Text style">
          <TextStyleMenu editor={editor} disabled={unavailable} />
        </ToolbarGroup>
        <ToolbarGroup aria-label="Text formatting">
          <Tool
            label="Bold"
            shortcut="⌘/Ctrl B"
            active={editor?.isActive('bold')}
            disabled={unavailable}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <Bold size={17} />
          </Tool>
          <Tool
            label="Italic"
            shortcut="⌘/Ctrl I"
            active={editor?.isActive('italic')}
            disabled={unavailable}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <Italic size={17} />
          </Tool>
          <Tool
            label="Underline"
            shortcut="⌘/Ctrl U"
            active={editor?.isActive('underline')}
            disabled={unavailable}
            onClick={() => editor?.chain().focus().toggleUnderline().run()}
          >
            <Underline size={17} />
          </Tool>
          <Tool
            label="Strikethrough"
            shortcut="⌘/Ctrl ⇧ S"
            active={editor?.isActive('strike')}
            disabled={unavailable}
            onClick={() => editor?.chain().focus().toggleStrike().run()}
          >
            <Strikethrough size={17} />
          </Tool>
          <Tool
            label="Inline code"
            shortcut="⌘/Ctrl E"
            active={editor?.isActive('code')}
            disabled={unavailable}
            onClick={() => editor?.chain().focus().toggleCode().run()}
          >
            <Code size={17} />
          </Tool>
        </ToolbarGroup>
        <ToolbarGroup aria-label="Lists and links">
          <Tool
            label="Bulleted list"
            shortcut="⌘/Ctrl ⇧ 8"
            active={editor?.isActive('bulletList')}
            disabled={unavailable}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <List size={18} />
          </Tool>
          <Tool
            label="Numbered list"
            shortcut="⌘/Ctrl ⇧ 7"
            active={editor?.isActive('orderedList')}
            disabled={unavailable}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered size={18} />
          </Tool>
          <Tool
            label="Link"
            shortcut="⌘/Ctrl K"
            active={editor?.isActive('link')}
            disabled={unavailable}
            onClick={onLinkRequest}
          >
            <Link size={17} />
          </Tool>
        </ToolbarGroup>
        <ToolbarGroup aria-label="Insert content">
          <InsertMenu editor={editor} disabled={unavailable} />
        </ToolbarGroup>
        <span className="rte-composer-spacer" aria-hidden="true" />
        {context}
        <ToolbarGroup aria-label="Edit history" className="rte-composer-group--history">
          <Tool
            label="Undo"
            shortcut="⌘/Ctrl Z"
            disabled={unavailable || !editor?.can().undo()}
            onClick={() => editor?.chain().focus().undo().run()}
          >
            <Undo2 size={17} />
          </Tool>
          <Tool
            label="Redo"
            shortcut="⌘/Ctrl ⇧ Z"
            disabled={unavailable || !editor?.can().redo()}
            onClick={() => editor?.chain().focus().redo().run()}
          >
            <Redo2 size={17} />
          </Tool>
        </ToolbarGroup>
      </Toolbar>
    </Tooltip.Provider>
  );
}
