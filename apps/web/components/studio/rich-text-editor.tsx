'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react';
import { X, Keyboard, Check } from 'lucide-react';
import { RichTextToolbar } from './rich-text-toolbar';
import { RichTextTableMenu } from './rich-text-table-menu';
import { RichTextTableControls } from './rich-text-table-controls';
import {
  bodyToEditorDocument,
  editorDocumentToBody,
  isSafeRichTextHref,
  type GuideStep,
} from '@guide/content';
import { StepBody } from '@guide/guide-ui';
import { createInstructionExtensions, inspectInstructionPaste } from './rich-text-extensions';
import './rich-text-editor.css';
import { cn } from '@guide/ui';

const editorFrame =
  'rich-text-editor relative min-w-0 rounded-[12px] border border-solid border-editor-line bg-editor-canvas text-editor-ink [box-shadow:0_2px_6px_color-mix(in_srgb,var(--gp-component-editor-text)_3%,transparent)] focus-within:border-action focus-within:[box-shadow:0_0_0_2px_color-mix(in_srgb,var(--gp-semantic-action-primary-background)_12%,transparent)] motion-reduce:[&_*]:[scroll-behavior:auto]';
const linkFormButton =
  'inline-flex min-h-9 cursor-pointer items-center justify-center gap-1.5 rounded-[6px] border-0 bg-editor-hover px-2.5 py-1.5 text-editor-ink [font:500_12px_var(--gp-semantic-font-body)]';

export interface RichTextEditorProps {
  value: GuideStep['body'];
  onChange(body: GuideStep['body']): void;
  onValidityChange?(message: string | null): void;
  draft?: unknown;
  onDraftChange?(document: unknown): void;
  id?: string;
  disabled?: boolean;
}

function validationMessage(error: unknown) {
  const detail = error instanceof Error && !error.message.startsWith('[') ? error.message : null;
  return (
    detail ??
    'These instructions exceed a content limit or contain an unsupported structure. Your edits are retained here. Shorten the content or use Undo before saving (tables: up to 10 columns and 50 rows).'
  );
}

function RetainedInstructions({ value, onValidityChange }: RichTextEditorProps) {
  const message =
    'These existing instructions exceed the visual editor limits. The original content is retained below, unchanged. Copy the content into shorter steps before removing this step, or reload to leave it unchanged.';
  useEffect(() => {
    // This is unchanged, already-valid legacy content. Keep unrelated saves available.
    onValidityChange?.(null);
  }, [onValidityChange]);
  return (
    <div className="mx-0 mt-6 mb-0 min-w-0">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <span>Instructions</span>
        <span>Read only</span>
      </div>
      <p className="mx-0 my-2.5 text-[13px] text-error" role="alert">
        {message}
      </p>
      <div className={`${editorFrame} rte-canvas`} role="region" aria-label="Retained instructions">
        <StepBody body={value} />
      </div>
    </div>
  );
}

export function RichTextEditor(props: RichTextEditorProps) {
  const [prepared] = useState(() => {
    try {
      return { document: (props.draft ?? bodyToEditorDocument(props.value)) as JSONContent };
    } catch {
      return { document: null };
    }
  });
  return prepared.document ? (
    <EditableInstructions {...props} initialDocument={prepared.document} />
  ) : (
    <RetainedInstructions {...props} />
  );
}

function EditableInstructions({
  value,
  onChange,
  onValidityChange,
  draft,
  onDraftChange,
  id,
  disabled = false,
  initialDocument,
}: RichTextEditorProps & { initialDocument: JSONContent }) {
  const generatedId = useId();
  const fieldId = id ?? `instructions-${generatedId}`;
  const initial = useRef(initialDocument);
  const callbacks = useRef({ onChange, onValidityChange, onDraftChange });
  callbacks.current = { onChange, onValidityChange, onDraftChange };
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkHref, setLinkHref] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const [, renderTransaction] = useState(0);
  const latestBody = useRef(JSON.stringify(value));

  function report(document: JSONContent, changed: boolean) {
    if (changed) callbacks.current.onDraftChange?.(document);
    try {
      const body = editorDocumentToBody(document);
      setError(null);
      callbacks.current.onValidityChange?.(null);
      if (changed) {
        latestBody.current = JSON.stringify(body);
        callbacks.current.onChange(body);
      }
    } catch (problem) {
      const message = validationMessage(problem);
      setError(message);
      callbacks.current.onValidityChange?.(message);
    }
  }

  const editor = useEditor({
    extensions: createInstructionExtensions(),
    content: initial.current,
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        id: fieldId,
        role: 'textbox',
        'aria-label': 'Instructions',
        'aria-multiline': 'true',
        'aria-describedby': `${fieldId}-help`,
        class: 'rte-canvas',
        spellcheck: 'true',
      },
      handlePaste(_view, event) {
        if (event.clipboardData?.files.length) {
          setNotice(
            'Images and attachments cannot be pasted yet. Your existing instructions are unchanged.',
          );
          return true;
        }
        const message = inspectInstructionPaste(event.clipboardData?.getData('text/html') ?? '');
        if (message) {
          setNotice(message);
          return true;
        }
        setNotice(null);
        return false;
      },
      handleDrop(_view, event, _slice, moved) {
        if (!moved && event.dataTransfer?.files.length) {
          setNotice(
            'Image and document uploads are not available yet. Your instructions are unchanged.',
          );
          return true;
        }
        return false;
      },
      handleKeyDown(_view, event) {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
          event.preventDefault();
          setLinkOpen(true);
          return true;
        }
        return false;
      },
    },
    onCreate: ({ editor: created }) => report(created.getJSON(), false),
    onUpdate: ({ editor: updated }) => report(updated.getJSON(), true),
    onTransaction: () => renderTransaction((previous) => previous + 1),
  });

  useEffect(() => {
    editor?.setEditable(!disabled, false);
  }, [editor, disabled]);
  useEffect(() => {
    // Parent echoes of our own edits must never reset the caret or undo history.
    const incoming = JSON.stringify(value);
    if (editor && incoming !== latestBody.current && draft === undefined) {
      latestBody.current = incoming;
      editor.commands.setContent(bodyToEditorDocument(value), { emitUpdate: false });
      report(editor.getJSON(), false);
    }
  }, [editor, value, draft]);
  useEffect(() => {
    if (!editor) return;
    editor.view.dom.setAttribute('aria-invalid', String(!!error));
    editor.view.dom.setAttribute(
      'aria-describedby',
      `${fieldId}-help${error ? ` ${fieldId}-error` : ''}`,
    );
  }, [editor, error, fieldId]);
  useEffect(() => {
    if (!linkOpen) return;
    setLinkHref(editor?.getAttributes('link').href ?? '');
    setLinkError(null);
    linkInput.current?.focus();
  }, [linkOpen, editor]);

  const unavailable = disabled || !editor;

  function applyLink() {
    if (!editor) return;
    const href = linkHref.trim();
    if (!isSafeRichTextHref(href)) {
      setLinkError('Enter a full https://, http:// or mailto: address.');
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    setLinkOpen(false);
  }

  return (
    <div className="mx-0 mt-6 mb-0 min-w-0">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <label
          className="cursor-text text-[13px] font-[650]"
          htmlFor={fieldId}
          onClick={() => editor?.commands.focus()}
        >
          Instructions
        </label>
        <span className="text-[12px] font-normal text-editor-muted max-[600px]:hidden">
          Text, panels & tables
        </span>
      </div>
      <div className={`${editorFrame}${disabled ? ' opacity-[0.7]' : ''}`}>
        <RichTextToolbar
          editor={editor}
          disabled={unavailable}
          onLinkRequest={() => setLinkOpen(!linkOpen)}
          context={
            editor?.isActive('table') ? (
              <RichTextTableMenu editor={editor} disabled={disabled} />
            ) : undefined
          }
        />
        {linkOpen && (
          <div
            className="absolute top-14.5 right-3 z-[40] flex w-[min(420px,calc(100%_-_24px))] flex-wrap items-center gap-2.5 rounded-[10px] border border-solid border-editor-line bg-editor-canvas p-4 [box-shadow:0_12px_36px_color-mix(in_srgb,var(--gp-component-editor-text)_16%,transparent)] max-[600px]:top-24.5"
            role="group"
            aria-label="Edit link"
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                applyLink();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setLinkOpen(false);
                editor?.commands.focus();
              }
            }}
          >
            <label className="w-full text-[12px] font-[650]" htmlFor={`${fieldId}-url`}>
              Link address
            </label>
            <input
              className="m-0 w-auto min-w-[140px] flex-1 border border-solid border-editor-line bg-editor-canvas px-3 py-[9px] text-[14px] text-editor-ink"
              ref={linkInput}
              id={`${fieldId}-url`}
              type="url"
              placeholder="https://example.com"
              value={linkHref}
              onChange={(event) => setLinkHref(event.target.value)}
              aria-invalid={!!linkError}
              aria-describedby={linkError ? `${fieldId}-link-error` : undefined}
            />
            <button type="button" className={linkFormButton} onClick={applyLink}>
              Apply link
            </button>
            {editor?.isActive('link') && (
              <button
                type="button"
                className={linkFormButton}
                onClick={() => {
                  editor.chain().focus().extendMarkRange('link').unsetLink().run();
                  setLinkOpen(false);
                }}
              >
                Remove link
              </button>
            )}
            <button
              type="button"
              className={cn(linkFormButton, 'absolute top-2 right-2 min-h-7 bg-transparent p-1')}
              aria-label="Close link editor"
              onClick={() => {
                setLinkOpen(false);
                editor?.commands.focus();
              }}
            >
              <X size={16} />
            </button>
            {linkError && (
              <p
                className="m-0 w-full text-[12px] text-error"
                id={`${fieldId}-link-error`}
                role="alert"
              >
                {linkError}
              </p>
            )}
          </div>
        )}
        <EditorContent editor={editor} />
        <RichTextTableControls editor={editor} disabled={disabled} />
        {!editor && (
          <div className="p-9 text-editor-muted" role="status">
            Loading editor…
          </div>
        )}
      </div>
      <div
        className="flex justify-between gap-2.5 px-0.5 py-3 text-[11px] text-editor-muted max-[600px]:text-[10px]"
        id={`${fieldId}-help`}
      >
        <span className="inline-flex items-center gap-1.5">
          <Keyboard size={14} aria-hidden="true" /> ⌘/Ctrl + B to format · Insert to add blocks
        </span>
        <span className="inline-flex items-center gap-1.5 max-[600px]:hidden">
          <Check size={13} aria-hidden="true" /> Rich text
        </span>
      </div>
      {error && (
        <p id={`${fieldId}-error`} className="mx-0 my-2.5 text-[13px] text-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <div
          className="mx-0 mt-2.5 mb-0 flex items-start gap-3 rounded-[8px] border border-solid border-info-line bg-info-surface px-3.5 py-3 text-info"
          role="status"
        >
          <p className="m-0 flex-1 text-[13px] text-inherit">{notice}</p>
          <button
            type="button"
            className="inline-flex min-h-6 cursor-pointer items-center justify-center gap-1.5 rounded-[6px] border-0 bg-transparent p-0.5 text-inherit [font:500_12px_var(--gp-semantic-font-body)]"
            aria-label="Dismiss paste message"
            onClick={() => setNotice(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
