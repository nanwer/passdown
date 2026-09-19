// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { type GuideStep } from '@guide/content';
import { RichTextEditor } from './rich-text-editor';

beforeAll(() => {
  // JSDOM has no layout; ProseMirror's focus/scroll code asks for range geometry.
  Range.prototype.getBoundingClientRect = () => new DOMRect();
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
});
afterEach(cleanup);
const value: GuideStep['body'] = [
  {
    type: 'paragraph',
    children: [{ type: 'text', text: 'Disconnect power', marks: ['bold'] }],
  },
];

describe('rich instruction field', () => {
  it('opens existing formatting directly without marking the guide dirty', async () => {
    const change = vi.fn();
    const draft = vi.fn();
    render(<RichTextEditor value={value} onChange={change} onDraftChange={draft} />);
    const field = await screen.findByRole('textbox', { name: 'Instructions' });
    expect(field).toHaveAttribute('contenteditable', 'true');
    expect(field.querySelector('strong')).toHaveTextContent('Disconnect power');
    expect(change).not.toHaveBeenCalled();
    expect(draft).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Preview instructions' })).not.toBeInTheDocument();
  });

  it('inserts an editable panel and changes its type while preserving the text', async () => {
    const change = vi.fn();
    render(<RichTextEditor value={value} onChange={change} />);
    await screen.findByRole('textbox', { name: 'Instructions' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Insert elements' }), { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitem', { name: 'Info panel' }));
    await waitFor(() =>
      expect(document.querySelector('[data-type="panel"]')).toHaveAttribute('data-tone', 'info'),
    );
    expect(document.querySelector('[data-node-view-content]')).toHaveTextContent(
      'Disconnect power',
    );
    fireEvent.keyDown(await screen.findByRole('button', { name: 'Panel type' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Note' }));
    await waitFor(() =>
      expect(document.querySelector('[data-type="panel"]')).toHaveAttribute('data-tone', 'note'),
    );
    expect(document.querySelectorAll('[data-type="panel"]')).toHaveLength(1);
    expect(change).toHaveBeenCalled();
  });

  it('retains legacy content that exceeds the visual editor limits without crashing or rewriting it', async () => {
    const change = vi.fn();
    const largeLegacy: GuideStep['body'] = Array.from({ length: 11 }, () => ({
      type: 'paragraph',
      children: [{ type: 'text', text: 'a'.repeat(10000), marks: [] }],
    }));
    const validity = vi.fn();
    render(<RichTextEditor value={largeLegacy} onChange={change} onValidityChange={validity} />);
    expect(validity).toHaveBeenCalledWith(null);
    expect(await screen.findByRole('alert')).toHaveTextContent(/retained/i);
    expect(screen.queryByRole('textbox', { name: 'Instructions' })).not.toBeInTheDocument();
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole('region', { name: 'Retained instructions' }).textContent).toHaveLength(
      110000,
    );
  });
});
