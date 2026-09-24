import type { EditorView } from '@tiptap/pm/view';

/**
 * Bring the editor's selection up to date with the caret the browser shows.
 *
 * The browser moves the caret for arrow keys itself, and ProseMirror hears
 * about it from a selectionchange event that is delivered later. A key pressed
 * before that event — Enter straight after an arrow, on a busy machine — used
 * to act on the old selection: with a word still selected, Enter replaced it.
 *
 * ProseMirror's own keydown handling only flushes when a DOM mutation is
 * already scheduled, so this calls `domObserver.flush()`, the routine
 * selectionchange itself triggers. That is not public API (checked against
 * prosemirror-view 1.42.4). Besides reading the selection, it also drains any
 * pending DOM mutations, exactly as it would moments later anyway.
 *
 * If an upgrade removes it, the editor keeps working but the race returns, so
 * that is reported rather than skipped silently; the "Enter acts where the
 * caret is" test in tests/e2e/visual-editor.spec.ts fails as well.
 */
export function syncSelectionFromDOM(view: EditorView) {
  const observer = (view as unknown as { domObserver?: { flush?: () => void } }).domObserver;
  if (typeof observer?.flush === 'function') {
    observer.flush();
    return;
  }
  if (!reported) {
    reported = true;
    console.error(
      'ProseMirror no longer exposes domObserver.flush(); keys pressed straight after moving the caret may act on the previous selection.',
    );
  }
}

let reported = false;
