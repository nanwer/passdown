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
import { cn } from '@guide/ui';

/** The custom properties each tone sets, which the block, its type button and the menu read. */
const toneVars = {
  info: '[--editor-panel-background:var(--gp-semantic-status-info-background)] [--editor-panel-foreground:var(--gp-semantic-status-info-foreground)]',
  note: '[--editor-panel-background:var(--gp-semantic-status-note-background)] [--editor-panel-foreground:var(--gp-semantic-status-note-foreground)]',
  success:
    '[--editor-panel-background:var(--gp-semantic-status-success-background)] [--editor-panel-foreground:var(--gp-semantic-status-success-foreground)]',
  warning:
    '[--editor-panel-background:var(--gp-semantic-status-warning-background)] [--editor-panel-foreground:var(--gp-semantic-status-warning-foreground)]',
  danger:
    '[--editor-panel-background:var(--gp-semantic-status-error-background)] [--editor-panel-foreground:var(--gp-semantic-status-error-foreground)]',
  decision:
    '[--editor-panel-background:var(--gp-semantic-accent-background)] [--editor-panel-foreground:var(--gp-semantic-accent-foreground)]',
} as const;
const editorSurface =
  'border border-solid border-[var(--gp-component-editor-border,var(--gp-semantic-border-subtle))] rounded-[9px] text-[var(--gp-component-editor-text,var(--gp-semantic-text-primary))] [background:var(--gp-component-editor-canvas,var(--gp-semantic-surface-raised))] [box-shadow:0_4px_10px_rgb(0_0_0_/_8%),0_10px_24px_rgb(0_0_0_/_10%)]';
const controlButton =
  'inline-flex min-h-8.5 w-8.5 cursor-pointer items-center justify-center gap-[7px] rounded-[5px] border-0 bg-transparent p-[7px] text-inherit [font:inherit] hover:[background:var(--gp-component-editor-hover,var(--gp-semantic-surface-sunken))] data-[state=open]:[background:var(--gp-component-editor-hover,var(--gp-semantic-surface-sunken))] focus-visible:[outline:2px_solid_var(--gp-semantic-focus-ring)] focus-visible:outline-offset-[1px]';

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
      className={`editor-panel my-4 mx-0 flex min-w-0 items-start gap-3 rounded-[7px] border border-solid border-transparent bg-[var(--editor-panel-background)] px-4 py-3.5 text-[var(--gp-component-editor-text,var(--gp-semantic-text-primary))] [transition:border-color_120ms_ease] data-[active]:border-[color-mix(in_srgb,var(--editor-panel-foreground)_38%,transparent)] motion-reduce:[transition:none] [td_&]:mx-0 [td_&]:my-[3px] [td_&]:gap-[9px] [td_&]:px-3 [td_&]:py-2.5 [th_&]:mx-0 [th_&]:my-[3px] [th_&]:gap-[9px] [th_&]:px-3 [th_&]:py-2.5 ${toneVars[kind.tone]}`}
      data-type="panel"
      data-tone={kind.tone}
      data-active={showControls || undefined}
      role="group"
      aria-label={`${kind.label} panel`}
    >
      <span
        className="mt-[3px] inline-flex flex-[0_0_21px] text-[var(--editor-panel-foreground)] select-none"
        contentEditable={false}
        title={`${kind.label} panel`}
      >
        <kind.Icon size={21} strokeWidth={2.2} aria-hidden="true" />
      </span>
      <NodeViewContent className="min-w-0 flex-[1_1_auto] [&>:first-child]:mt-0 [&>:last-child]:mb-0 [&>[data-node-view-content-react]>:first-child]:mt-0 [&>[data-node-view-content-react]>:last-child]:mb-0" />
      {showControls &&
        createPortal(
          <div
            ref={controlsRef}
            className={`editor-panel-controls fixed z-[45] flex w-[max-content] items-center gap-[3px] p-1 [font:13px/1.4_var(--gp-semantic-font-body)] ${editorSurface}`}
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
                  className={cn(
                    controlButton,
                    'w-auto min-w-[111px] justify-start bg-[var(--editor-panel-background)] px-[9px] font-[650] text-[var(--editor-panel-foreground)] [&>:last-child]:ms-auto',
                    toneVars[kind.tone],
                  )}
                  aria-label="Panel type"
                >
                  <kind.Icon size={18} aria-hidden="true" />
                  <span>{kind.label}</span>
                  <ChevronDown size={15} aria-hidden="true" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className={`z-[55] max-h-[var(--radix-dropdown-menu-content-available-height)] w-53.5 overflow-y-auto p-1.5 [font:14px/1.4_var(--gp-semantic-font-body)] ${editorSurface}`}
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
                  <DropdownMenu.Label className="px-2.5 py-[7px] text-[11px] font-[650] tracking-[0.035em] text-[var(--gp-component-editor-muted,var(--gp-semantic-text-secondary))]">
                    Panel type
                  </DropdownMenu.Label>
                  {panelTypes.map(({ tone, label, Icon }) => (
                    <DropdownMenu.Item
                      key={tone}
                      className={`flex min-h-10 cursor-pointer items-center gap-[11px] rounded-[5px] px-2.5 py-[9px] [outline:none] select-none focus-visible:[outline:2px_solid_var(--gp-semantic-focus-ring)] focus-visible:outline-offset-[1px] data-[highlighted]:[background:var(--gp-component-editor-hover,var(--gp-semantic-surface-sunken))] ${toneVars[tone]}`}
                      onSelect={() => changeType(tone)}
                      aria-label={label}
                    >
                      <Icon
                        size={19}
                        className="flex-[0_0_auto] text-[var(--editor-panel-foreground)]"
                        aria-hidden="true"
                      />
                      <span>{label}</span>
                      {kind.tone === tone && (
                        <Check
                          size={16}
                          className="ms-auto text-[var(--gp-component-editor-muted,var(--gp-semantic-text-secondary))]"
                          aria-hidden="true"
                        />
                      )}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
            <span
              className="mx-[3px] h-6 w-[1px] [background:var(--gp-component-editor-border,var(--gp-semantic-border-subtle))]"
              aria-hidden="true"
            />
            <button
              type="button"
              className={controlButton}
              aria-label="Exit panel"
              title="Continue below panel (⌘/Ctrl+Enter)"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => operate(onExit)}
            >
              <CornerDownRight size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className={controlButton}
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
