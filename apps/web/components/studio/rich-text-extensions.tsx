'use client';

import { Extension, Node, mergeAttributes, type Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { TableKit, TableView } from '@tiptap/extension-table';
import Placeholder from '@tiptap/extension-placeholder';
import { ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { TextSelection, Plugin } from '@tiptap/pm/state';
import { isSafeRichTextHref } from '@guide/content';
import { RichTextPanel, panelTypes, type PanelTone } from './rich-text-panel';

export { panelTypes, type PanelTone } from './rich-text-panel';

function PanelView(props: NodeViewProps) {
  return (
    <RichTextPanel
      {...props}
      onExit={() => {
        exitContainingBlock(props.editor, ['panel']);
      }}
      onUnwrap={() => {
        unwrapPanel(props.editor);
      }}
    />
  );
}

const InstructionPanel = Node.create({
  name: 'panel',
  group: 'block',
  content: 'block+',
  defining: true,
  addAttributes() {
    return {
      tone: {
        default: 'info',
        parseHTML: (element: HTMLElement) => {
          const tone = element.getAttribute('data-tone');
          return panelTypes.some((kind) => kind.tone === tone) ? tone : 'info';
        },
        renderHTML: (attributes) => ({ 'data-tone': attributes.tone }),
      },
    };
  },
  parseHTML() {
    return [{ tag: 'aside[data-type="panel"]' }, { tag: 'div[data-type="panel"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['aside', mergeAttributes(HTMLAttributes, { 'data-type': 'panel' }), 0];
  },
  addNodeView() {
    return ReactNodeViewRenderer(PanelView);
  },
});

const PreservedAlignment = Extension.create({
  name: 'preservedAlignment',
  addGlobalAttributes() {
    const safeAlignment = (value: string | null) =>
      ['left', 'center', 'right'].includes(value ?? '') ? value : null;
    return [
      {
        types: ['paragraph', 'heading'],
        attributes: {
          textAlign: {
            default: null,
            parseHTML: (element: HTMLElement) => safeAlignment(element.style.textAlign),
            renderHTML: (attributes) =>
              attributes.textAlign ? { style: `text-align: ${attributes.textAlign}` } : {},
          },
        },
      },
      {
        types: ['tableCell', 'tableHeader'],
        attributes: {
          align: {
            default: null,
            parseHTML: (element: HTMLElement) =>
              safeAlignment(element.style.textAlign || element.getAttribute('align')),
            renderHTML: (attributes) =>
              attributes.align ? { style: `text-align: ${attributes.align}` } : {},
          },
        },
      },
    ];
  },
});

// Legacy guide text permits code combined with emphasis. Keep those marks together.
const InstructionStarterKit = StarterKit.extend({
  addExtensions() {
    return (this.parent?.() ?? []).map((extension) =>
      extension.name === 'code' ? extension.extend({ excludes: '' }) : extension,
    );
  },
});

const BlockExit = Extension.create({
  name: 'instructionBlockExit',
  addKeyboardShortcuts() {
    return {
      'Mod-Enter': () => exitContainingBlock(this.editor, ['panel', 'table', 'blockquote']),
    };
  },
});

class AccessibleTableView extends TableView {
  constructor(...args: ConstructorParameters<typeof TableView>) {
    super(...args);
    this.dom.tabIndex = 0;
    this.dom.setAttribute('role', 'region');
    this.dom.setAttribute('aria-label', 'Scrollable instruction table');
  }
}

const TableAccessibility = Extension.create({
  name: 'instructionTableAccessibility',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        view(view) {
          let frame = 0;
          let destroyed = false;
          const labelTables = () => {
            frame = 0;
            if (destroyed || view.isDestroyed) return;
            const tables = view.dom.querySelectorAll<HTMLElement>('.tableWrapper');
            tables.forEach((wrapper, index) => {
              const label = `Scrollable instruction table${tables.length > 1 ? ` ${index + 1}` : ''}`;
              if (wrapper.getAttribute('aria-label') !== label)
                wrapper.setAttribute('aria-label', label);
            });
          };
          // React moves/detaches the editor DOM during teardown. Keep DOM-only
          // accessibility updates outside ProseMirror's synchronous update cycle.
          const schedule = () => {
            if (!frame && !destroyed) frame = requestAnimationFrame(labelTables);
          };
          schedule();
          return {
            update: schedule,
            destroy() {
              destroyed = true;
              cancelAnimationFrame(frame);
            },
          };
        },
      }),
    ];
  },
});

export function createInstructionExtensions() {
  return [
    InstructionStarterKit.configure({
      codeBlock: false,
      horizontalRule: false,
      trailingNode: false,
      link: {
        openOnClick: false,
        autolink: false,
        linkOnPaste: false,
        isAllowedUri: (url) => isSafeRichTextHref(url),
        HTMLAttributes: { target: null, rel: 'noopener noreferrer nofollow', class: null },
      },
    }),
    TableKit.configure({
      table: {
        resizable: false,
        renderWrapper: true,
        cellMinWidth: 200,
        View: AccessibleTableView,
      },
    }),
    TableAccessibility,
    InstructionPanel,
    PreservedAlignment,
    BlockExit,
    Placeholder.configure({
      placeholder: 'Describe this step…',
      showOnlyCurrent: true,
      includeChildren: true,
    }),
  ];
}

export function insertPanel(editor: Editor, tone: PanelTone): boolean {
  if (editor.isActive('panel'))
    return editor.chain().focus().updateAttributes('panel', { tone }).run();
  if (editor.can().wrapIn('panel', { tone }))
    return editor.chain().focus().wrapIn('panel', { tone }).run();
  return editor
    .chain()
    .focus()
    .insertContent({ type: 'panel', attrs: { tone }, content: [{ type: 'paragraph' }] })
    .run();
}

export function exitContainingBlock(editor: Editor, names: string[]): boolean {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    if (!names.includes($from.node(depth).type.name)) continue;
    const after = $from.after(depth);
    const following = editor.state.doc.nodeAt(after);
    if (following?.isTextblock)
      return editor
        .chain()
        .focus()
        .setTextSelection(after + 1)
        .run();
    const paragraph = editor.schema.nodes.paragraph?.create();
    if (!paragraph) return false;
    const tr = editor.state.tr.insert(after, paragraph);
    tr.setSelection(TextSelection.create(tr.doc, after + 1));
    editor.view.dispatch(tr.scrollIntoView());
    editor.view.focus();
    return true;
  }
  return false;
}

export function unwrapPanel(editor: Editor): boolean {
  const { $from } = editor.state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const panel = $from.node(depth);
    if (panel.type.name !== 'panel') continue;
    const start = $from.before(depth);
    const tr = editor.state.tr.replaceWith(start, start + panel.nodeSize, panel.content);
    tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(start + 1, tr.doc.content.size))));
    editor.view.dispatch(tr.scrollIntoView());
    editor.view.focus();
    return true;
  }
  return false;
}

/** Reject unsupported rich paste before changing the document, leaving the clipboard intact. */
export function inspectInstructionPaste(html: string): string | null {
  if (!html) return null;
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  if (
    parsed.querySelector('script,iframe,object,embed,svg,math') ||
    [...parsed.body.querySelectorAll('*')].some((element) =>
      [...element.attributes].some((attribute) => /^on/i.test(attribute.name)),
    )
  )
    return 'This paste contains active or embedded content. Nothing was inserted. Paste plain text instead (⌘/Ctrl+Shift+V).';
  if (parsed.querySelector('img,video,audio,canvas,input,textarea,select,button'))
    return 'Images, media and form controls cannot be pasted yet. Nothing was inserted. Paste the text separately (⌘/Ctrl+Shift+V).';
  if (parsed.querySelector('table table'))
    return 'Nested tables are not supported. Nothing was inserted. Paste one table at a time.';
  if (
    [...parsed.querySelectorAll('td,th')].some(
      (cell) =>
        Number(cell.getAttribute('colspan') ?? 1) !== 1 ||
        Number(cell.getAttribute('rowspan') ?? 1) !== 1,
    )
  )
    return 'Merged table cells are not supported yet. Nothing was inserted. Unmerge cells before copying or paste plain text.';
  if (parsed.querySelector('[data-type="panel"] [data-type="panel"]'))
    return 'Panels cannot be nested inside panels. Nothing was inserted. Paste each panel separately.';
  if (
    [...parsed.querySelectorAll('a[href]')].some(
      (link) => !isSafeRichTextHref(link.getAttribute('href')),
    )
  )
    return 'This paste contains a link that is not an HTTP, HTTPS or email address. Nothing was inserted. Paste plain text instead.';
  if (parsed.querySelector('pre,hr,details'))
    return 'This paste contains a block this editor cannot preserve yet. Nothing was inserted. Paste plain text instead (⌘/Ctrl+Shift+V).';
  return null;
}
