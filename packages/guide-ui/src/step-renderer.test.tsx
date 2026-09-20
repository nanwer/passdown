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

describe('annotated photographs', () => {
  const annotated = (annotations: GuideStep['media'][number]['annotations']): GuideStep => ({
    ...step('Undo the screw.'),
    media: [
      {
        assetId: '20000000-0000-4000-8000-000000000001',
        alt: 'The underside of the case',
        caption: '',
        annotations,
      },
    ],
  });

  it('places a marker at its fraction of the image rather than at that many percent', () => {
    const { container } = render(
      <StepRenderer
        step={annotated([{ type: 'pin', x: 0.5, y: 0.25, label: 'The centre screw' }])}
        index={0}
        mediaSrc={(id) => `/media/${id}`}
      />,
    );
    const mark = container.querySelector('.step-media-mark') as HTMLElement;
    // 0.5 is the middle of the image. Written straight into a percentage it
    // would be 0.5%, which is the far left edge.
    expect(mark.style.left).toBe('50%');
    expect(mark.style.top).toBe('25%');
  });

  it('numbers a marker to match its own entry in the legend', () => {
    const { container } = render(
      <StepRenderer
        step={annotated([
          { type: 'arrow', x: 0.1, y: 0.1, toX: 0.4, toY: 0.4, label: 'Slide this way' },
          { type: 'pin', x: 0.8, y: 0.8, label: 'The clip' },
        ])}
        index={0}
        mediaSrc={(id) => `/media/${id}`}
      />,
    );
    const marks = [...container.querySelectorAll('.step-media-mark')].map((m) => m.textContent);
    // The legend is an ordered list over every annotation, so a pin that is
    // second overall must not present itself as the first.
    expect(marks).toEqual(['1', '2']);
    const legend = [...container.querySelectorAll('.step-media-legend li')].map(
      (li) => li.textContent,
    );
    expect(legend).toEqual(['Slide this way', 'The clip']);
  });

  it('draws an arrow to where it points, with its own arrowhead', () => {
    const { container } = render(
      <StepRenderer
        step={annotated([
          { type: 'arrow', x: 0.2, y: 0.3, toX: 0.7, toY: 0.9, label: 'Lift here' },
        ])}
        index={0}
        mediaSrc={(id) => `/media/${id}`}
      />,
    );
    const line = container.querySelector('.step-media-arrows line') as SVGLineElement;
    expect(line.getAttribute('x1')).toBe('20%');
    expect(line.getAttribute('y1')).toBe('30%');
    // Without these the arrow is a dot at its own tail: it knows where it
    // starts and never draws where it points.
    expect(line.getAttribute('x2')).toBe('70%');
    expect(line.getAttribute('y2')).toBe('90%');
    const head = container.querySelector('.step-media-arrows marker') as SVGMarkerElement;
    expect(line.getAttribute('marker-end')).toBe(`url(#${head.id})`);
    // Two images on one page must not share one definition.
    expect(head.id).toContain('20000000-0000-4000-8000-000000000001');
  });

  it('keeps every label readable when the overlay is not', () => {
    render(
      <StepRenderer
        step={annotated([
          { type: 'pin', x: 0.5, y: 0.5, label: 'The centre screw' },
          { type: 'arrow', x: 0.1, y: 0.1, toX: 0.2, toY: 0.2, label: 'Slide this way' },
        ])}
        index={0}
        mediaSrc={(id) => `/media/${id}`}
      />,
    );
    // Markers are decorative; the legend carries the meaning.
    expect(screen.getByRole('list', { name: '' }).tagName).toBe('OL');
    expect(screen.getByText('The centre screw')).toBeVisible();
    expect(screen.getByText('Slide this way')).toBeVisible();
    expect(screen.getByRole('img', { name: 'The underside of the case' })).toBeVisible();
  });
});

describe('picture captions', () => {
  const withCaption = (caption: string, alt = 'The underside of the case'): GuideStep => ({
    ...step('Undo the screw.'),
    media: [{ assetId: '30000000-0000-4000-8000-000000000001', alt, caption, annotations: [] }],
  });

  it('shows a caption to everyone without it standing in for the description', () => {
    render(
      <StepRenderer
        step={withCaption('Taken with the case upside down.')}
        index={0}
        mediaSrc={(id) => `/media/${id}`}
      />,
    );
    expect(screen.getByText('Taken with the case upside down.')).toBeVisible();
    // The two do different jobs: a caption is read alongside the picture, a
    // description instead of it. A caption must never overwrite the alt text.
    expect(screen.getByRole('img', { name: 'The underside of the case' })).toBeVisible();
  });

  it('adds nothing when a picture has neither caption nor marks', () => {
    const { container } = render(
      <StepRenderer step={withCaption('')} index={0} mediaSrc={(id) => `/media/${id}`} />,
    );
    // An empty figcaption is a gap a screen reader announces for no reason.
    expect(container.querySelector('figcaption')).toBeNull();
  });

  it('keeps a caption and the list of marks apart', () => {
    const { container } = render(
      <StepRenderer
        step={{
          ...step('Undo the screw.'),
          media: [
            {
              assetId: '30000000-0000-4000-8000-000000000002',
              alt: 'The case',
              caption: 'Seen from below.',
              annotations: [{ type: 'pin', x: 0.5, y: 0.5, label: 'The centre screw' }],
            },
          ],
        }}
        index={0}
        mediaSrc={(id) => `/media/${id}`}
      />,
    );
    expect(container.querySelector('.step-media-caption')?.textContent).toBe('Seen from below.');
    expect(container.querySelector('.step-media-legend')?.textContent).toBe('The centre screw');
  });
});
