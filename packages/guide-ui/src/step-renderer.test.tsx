// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { parseStepMarkdown, editorDocumentToBody, type GuideStep } from '@guide/content';
import { StepRenderer } from './step-renderer';
afterEach(cleanup);
const step = (source: string): GuideStep => ({
  id: '10000000-0000-4000-8000-000000000001',
  title: 'Prepare',
  body: parseStepMarkdown(source).body,
  media: [],
  callouts: [],
});
describe('shared formatted instruction renderer', () => {
  it('renders semantic headings, inline marks and numbered lists', () => {
    render(
      <StepRenderer
        step={step('# Before you start\n\nUse **firm** and *gentle* pressure.\n\n3. Lift\n4. Hold')}
        index={0}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Before you start', level: 3 })).toBeVisible();
    expect(screen.getByText('firm').tagName).toBe('STRONG');
    expect(screen.getByText('gentle').tagName).toBe('EM');
    expect(screen.getByRole('list').tagName).toBe('OL');
    expect(screen.getByRole('list')).toHaveAttribute('start', '3');
  });
  it('renders labelled notices, decisions, quotes and readable table headers', () => {
    render(
      <StepRenderer
        step={step(
          '> [!WARNING]\n> Disconnect power.\n\n> [!DECISION]\n> If damaged, replace.\n\n> Measure twice.\n\n| Part | Count |\n| --- | ---: |\n| Screw | **2** |',
        )}
        index={0}
      />,
    );
    expect(screen.getByRole('note', { name: 'Warning' })).toHaveTextContent('Disconnect power.');
    expect(screen.getByRole('note', { name: 'Decision' })).toHaveTextContent(
      'If damaged, replace.',
    );
    expect(screen.getByText('Measure twice.').closest('blockquote')).not.toBeNull();
    expect(screen.getByRole('columnheader', { name: 'Part' })).toHaveAttribute('scope', 'col');
    expect(screen.getByRole('cell', { name: '2' }).querySelector('strong')).not.toBeNull();
  });
  it('shows malicious HTML, Markdown links and images as inert text with no network-bearing elements', () => {
    const { container } = render(
      <StepRenderer
        step={step(
          '<script>alert(1)</script>\n\n[click](javascript:alert(1))\n\n![tracking](https://tracker.test/image)',
        )}
        index={0}
      />,
    );
    expect(container.querySelector('script, iframe, img, a')).toBeNull();
    expect(screen.getByText('<script>alert(1)</script>')).toBeVisible();
    expect(screen.getByText('[click](javascript:alert(1))')).toBeVisible();
  });
});

it('renders visual panels inside real table cells and rich links without exposing author HTML', () => {
  const body = editorDocumentToBody({
    type: 'doc',
    content: [
      {
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableHeader',
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Preparation' }] }],
              },
            ],
          },
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                attrs: { align: 'right' },
                content: [
                  {
                    type: 'panel',
                    attrs: { tone: 'note' },
                    content: [
                      { type: 'paragraph', content: [{ type: 'text', text: 'Read the manual.' }] },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Manual',
            marks: [
              { type: 'link', attrs: { href: 'https://example.com/manual' } },
              { type: 'underline' },
            ],
          },
          { type: 'hardBreak' },
          { type: 'text', text: '<img src=x onerror=alert(1)>', marks: [{ type: 'strike' }] },
        ],
      },
      { type: 'paragraph' },
      {
        type: 'bulletList',
        content: [
          {
            type: 'listItem',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: 'First' }] },
              {
                type: 'orderedList',
                attrs: { start: 2 },
                content: [
                  {
                    type: 'listItem',
                    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested' }] }],
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  });
  const { container } = render(<StepRenderer step={{ ...step(''), body }} index={0} />);
  expect(screen.getByRole('note', { name: 'Note' }).closest('td')).not.toBeNull();
  expect(screen.getByRole('note', { name: 'Note' })).toHaveTextContent('Read the manual.');
  expect(screen.getByRole('columnheader', { name: 'Preparation' })).toHaveAttribute('scope', 'col');
  expect(screen.getByRole('cell')).toHaveStyle({ textAlign: 'right' });
  expect(screen.getByRole('link', { name: 'Manual' })).toHaveAttribute(
    'href',
    'https://example.com/manual',
  );
  expect(screen.getByText('<img src=x onerror=alert(1)>').tagName).toBe('S');
  expect(container.querySelector('img, script, iframe')).toBeNull();
  expect(container.querySelector('br')).not.toBeNull();
  expect(container.querySelector('p:empty')).not.toBeNull();
  expect(container.querySelector('ul ol')).toHaveAttribute('start', '2');
});
