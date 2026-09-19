'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import {
  NodeViewContent,
  NodeViewWrapper,
  useEditorState,
  type NodeViewProps,
} from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import {
  Info,
  StickyNote,
  CircleCheck,
  TriangleAlert,
  CircleAlert,
  GitBranch,
  ChevronDown,
  Check,
  CornerDownRight,
  PanelTopClose,
} from 'lucide-react';
import './rich-text-panel.css';

export const panelTypes = [
  { tone: 'info', label: 'Info', Icon: Info },
  { tone: 'note', label: 'Note', Icon: StickyNote },
  { tone: 'success', label: 'Success', Icon: CircleCheck },
  { tone: 'warning', label: 'Warning', Icon: TriangleAlert },
  { tone: 'danger', label: 'Error', Icon: CircleAlert },
  { tone: 'decision', label: 'Decision', Icon: GitBranch },
] as const;
export type PanelTone = (typeof panelTypes)[number]['tone'];

type PanelProps = NodeViewProps & { onExit: () => void; onUnwrap: () => void };

/** Node controls live outside ProseMirror's content DOM, including in narrow table cells. */
export function RichTextPanel({ node, editor, getPos, selected, onExit, onUnwrap }: PanelProps) {
  const kind = panelTypes.find(({ tone }) => tone === node.attrs.tone) ?? panelTypes[0];
  const panelRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [controlsFocused, setControlsFocused] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const state = useEditorState({
    editor,
    selector: ({ editor: current }) => {
      const start = getPos();
      const { from, to } = current.state.selection;
      return {
        active: typeof start === 'number' && from >= start && to <= start + node.nodeSize,
        focused: current.isFocused,
        editable: current.isEditable,
      };
    },
  });
  const showControls =
    state.editable &&
    (selected || (state.active && (state.focused || controlsFocused || menuOpen)));

  useEffect(() => {
    if (!showControls) return;
    const updatePosition = () => {
      const element = panelRef.current;
      if (!element) return;
      const bounds = element.getBoundingClientRect();
      if (bounds.bottom < 0 || bounds.top > window.innerHeight) {
        setPosition(null);
        return;
      }
      const width = controlsRef.current?.offsetWidth || 226;
      const height = controlsRef.current?.offsetHeight || 40;
      const left = Math.max(
        8,
        Math.min(bounds.left + (bounds.width - width) / 2, window.innerWidth - width - 8),
      );
      const below = bounds.bottom + 8;
      const top =
        below + height < window.innerHeight - 8 ? below : Math.max(8, bounds.top - height - 8);
      setPosition({ left, top });
    };
    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updatePosition);
    if (panelRef.current) observer?.observe(panelRef.current);
    if (controlsRef.current) observer?.observe(controlsRef.current);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      observer?.disconnect();
    };
  }, [showControls, node]);

  useEffect(() => {
    if (!showControls) return;
    const releaseControls = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (controlsRef.current?.contains(target) || target.closest('[data-editor-panel-menu]'))
        return;
      setControlsFocused(false);
    };
    document.addEventListener('pointerdown', releaseControls, true);
    return () => document.removeEventListener('pointerdown', releaseControls, true);
  }, [showControls]);

  // A menu owns DOM focus, while ProseMirror retains its logical selection. Only move that
  // selection if the user explicitly operates a different panel's controls.
  const selectThisPanel = () => {
    const start = getPos();
    if (typeof start !== 'number') return false;
    const { from, to } = editor.state.selection;
    if (from <= start || to >= start + node.nodeSize) {
      const tr = editor.state.tr;
      tr.setSelection(TextSelection.near(tr.doc.resolve(start + 1)));
      editor.view.dispatch(tr);
    }
    return true;
  };
  const changeType = (tone: PanelTone) => {
    const start = getPos();
    if (typeof start !== 'number') return;
    editor.view.dispatch(editor.state.tr.setNodeMarkup(start, undefined, { ...node.attrs, tone }));
    editor.view.focus();
  };
  const operate = (action: () => void) => {
    if (selectThisPanel()) action();
    setControlsFocused(false);
  };

  return (
    <NodeViewWrapper
      ref={panelRef}
      className={`editor-panel editor-panel-tone--${kind.tone}`}
      data-type="panel"
      data-tone={kind.tone}
      data-active={showControls || undefined}
      role="group"
      aria-label={`${kind.label} panel`}
    >
      <span className="editor-panel-icon" contentEditable={false} title={`${kind.label} panel`}>
        <kind.Icon size={21} strokeWidth={2.2} aria-hidden="true" />
      </span>
      <NodeViewContent className="editor-panel-content" />
      {showControls &&
        createPortal(
          <div
            ref={controlsRef}
            className="editor-panel-controls"
            role="toolbar"
            aria-label="Panel controls"
            style={{
              left: position?.left ?? 0,
              top: position?.top ?? 0,
              visibility: position ? 'visible' : 'hidden',
            }}
            onPointerDownCapture={() => setControlsFocused(true)}
            onFocusCapture={() => setControlsFocused(true)}
            onKeyDown={(event) => {
              if (!(event.target instanceof Element) || !event.currentTarget.contains(event.target))
                return;
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              const buttons = [
                ...event.currentTarget.querySelectorAll<HTMLButtonElement>('button'),
              ];
              const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? buttons.length - 1
                    : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) %
                      buttons.length;
              event.preventDefault();
              buttons[next]?.focus();
            }}
            onBlurCapture={(event) => {
              if (
                event.relatedTarget instanceof Element &&
                !event.currentTarget.contains(event.relatedTarget) &&
                !event.relatedTarget.closest('[data-editor-panel-menu]')
              )
                setControlsFocused(false);
            }}
          >
            <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className={`editor-panel-type editor-panel-tone--${kind.tone}`}
                  aria-label="Panel type"
                >
                  <kind.Icon size={18} aria-hidden="true" />
                  <span>{kind.label}</span>
                  <ChevronDown size={15} aria-hidden="true" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="editor-panel-menu"
                  data-editor-panel-menu=""
                  sideOffset={7}
                  align="start"
                  collisionPadding={8}
                  onCloseAutoFocus={(event) => {
                    // Keep a typed selection intact after choosing a type. Escape naturally
                    // returns focus to the menu button for further keyboard navigation.
                    if (editor.isFocused) event.preventDefault();
                  }}
                >
                  <DropdownMenu.Label className="editor-panel-menu-label">
                    Panel type
                  </DropdownMenu.Label>
                  {panelTypes.map(({ tone, label, Icon }) => (
                    <DropdownMenu.Item
                      key={tone}
                      className={`editor-panel-menu-item editor-panel-tone--${tone}`}
                      onSelect={() => changeType(tone)}
                      aria-label={label}
                    >
                      <Icon size={19} className="editor-panel-menu-icon" aria-hidden="true" />
                      <span>{label}</span>
                      {kind.tone === tone && (
                        <Check size={16} className="editor-panel-menu-check" aria-hidden="true" />
                      )}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <span className="editor-panel-controls-divider" aria-hidden="true" />
            <button
              type="button"
              aria-label="Exit panel"
              title="Continue below panel (⌘/Ctrl+Enter)"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => operate(onExit)}
            >
              <CornerDownRight size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Remove panel style"
              title="Remove panel styling, keep content"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => operate(onUnwrap)}
            >
              <PanelTopClose size={18} aria-hidden="true" />
            </button>
          </div>,
          document.body,
        )}
    </NodeViewWrapper>
  );
}
