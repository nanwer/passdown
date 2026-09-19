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
    <div className="rich-text-field">
      <div className="rte-field-heading">
        <span>Instructions</span>
        <span>Read only</span>
      </div>
      <p className="rte-error" role="alert">
        {message}
      </p>
      <div className="rich-text-editor rte-canvas" role="region" aria-label="Retained instructions">
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
    <div className="rich-text-field">
      <div className="rte-field-heading">
        <label htmlFor={fieldId} onClick={() => editor?.commands.focus()}>
          Instructions
        </label>
        <span className="rte-field-detail">Text, panels & tables</span>
      </div>
      <div className={`rich-text-editor${disabled ? ' rich-text-editor--disabled' : ''}`}>
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
            className="rte-link-form"
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
            <label htmlFor={`${fieldId}-url`}>Link address</label>
            <input
              ref={linkInput}
              id={`${fieldId}-url`}
              type="url"
              placeholder="https://example.com"
              value={linkHref}
              onChange={(event) => setLinkHref(event.target.value)}
              aria-invalid={!!linkError}
              aria-describedby={linkError ? `${fieldId}-link-error` : undefined}
            />
            <button type="button" onClick={applyLink}>
              Apply link
            </button>
            {editor?.isActive('link') && (
              <button
                type="button"
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
              className="rte-icon-button"
              aria-label="Close link editor"
              onClick={() => {
                setLinkOpen(false);
                editor?.commands.focus();
              }}
            >
              <X size={16} />
            </button>
            {linkError && (
              <p id={`${fieldId}-link-error`} role="alert">
                {linkError}
              </p>
            )}
          </div>
        )}
        <EditorContent editor={editor} />
        <RichTextTableControls editor={editor} disabled={disabled} />
        {!editor && (
          <div className="rte-loading" role="status">
            Loading editor…
          </div>
        )}
      </div>
      <div className="rte-footer" id={`${fieldId}-help`}>
        <span>
          <Keyboard size={14} aria-hidden="true" /> ⌘/Ctrl + B to format · Insert to add blocks
        </span>
        <span>
          <Check size={13} aria-hidden="true" /> Rich text
        </span>
      </div>
      {error && (
        <p id={`${fieldId}-error`} className="rte-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <div className="rte-notice" role="status">
          <p>{notice}</p>
          <button type="button" aria-label="Dismiss paste message" onClick={() => setNotice(null)}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
