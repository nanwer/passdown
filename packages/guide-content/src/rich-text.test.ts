import { describe, expect, it } from 'vitest';
import {
  bodyToEditorDocument,
  editorDocumentToBody,
  guideDocumentSchema,
  hasInstructionText,
  richDocumentSchema,
  formatStepMarkdown,
  type GuideStep,
} from './index';

const text = (value = 'Switch off power.') => ({ type: 'text', text: value });
const paragraph = (value = 'Switch off power.') => ({ type: 'paragraph', content: [text(value)] });
const document = (...content: unknown[]) => ({ type: 'doc', content });
const panel = (tone = 'info') => ({ type: 'panel', attrs: { tone }, content: [paragraph()] });
const table = () => ({
  type: 'table',
  content: [
    {
      type: 'tableRow',
      content: [
        { type: 'tableHeader', content: [paragraph('Action')] },
        { type: 'tableHeader', content: [paragraph('Result')] },
      ],
    },
    {
      type: 'tableRow',
      content: [
        { type: 'tableCell', content: [panel('note')] },
        { type: 'tableCell', content: [paragraph('Safe')] },
      ],
    },
  ],
});

describe('bounded visual content', () => {
  it('bounds table dimensions and rejects extra mark metadata instead of silently stripping it', () => {
    const cell = { type: 'tableCell', content: [paragraph()] };
    for (const source of [
      document({
        type: 'table',
        content: [{ type: 'tableRow', content: Array.from({ length: 11 }, () => cell) }],
      }),
      document({
        type: 'table',
        content: Array.from({ length: 52 }, () => ({ type: 'tableRow', content: [cell] })),
      }),
      document({
        type: 'paragraph',
        content: [{ ...text(), marks: [{ type: 'bold', attrs: { class: 'unsafe' } }] }],
      }),
      document({
        type: 'paragraph',
        content: [
          {
            ...text(),
            marks: [{ type: 'link', attrs: { href: 'https://example.com', onclick: 'unsafe' } }],
          },
        ],
      }),
      document({
        type: 'paragraph',
        content: [{ ...text(), marks: [{ type: 'bold' }, { type: 'bold' }] }],
      }),
    ])
      expect(() => editorDocumentToBody(source)).toThrow();
    const maxRows = document({
      type: 'table',
      content: Array.from({ length: 51 }, () => ({ type: 'tableRow', content: [cell] })),
    });
    expect(editorDocumentToBody(maxRows)).toHaveLength(1);
  });
  it('preserves legacy blank lines and exact text up to the aggregate limit', () => {
    const long = document(paragraph('x'.repeat(100000)));
    expect(bodyToEditorDocument(editorDocumentToBody(long))).toEqual(long);
  });

  it('preserves editable panels inside table cells and safe inline formatting', () => {
    const source = document(table(), {
      type: 'paragraph',
      content: [
        {
          ...text('Manual'),
          marks: [
            { type: 'underline' },
            { type: 'strike' },
            { type: 'link', attrs: { href: 'https://example.com/manual' } },
          ],
        },
      ],
    });
    const body = editorDocumentToBody(source);
    expect(bodyToEditorDocument(body)).toEqual(source);
    expect(hasInstructionText(body)).toBe(true);
    expect(() => formatStepMarkdown(body)).toThrow(/visual|rich/i);
  });
  it('preserves formatted lists inside a panel inside a table cell', () => {
    const source = document({
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              content: [
                {
                  type: 'panel',
                  attrs: { tone: 'warning' },
                  content: [
                    {
                      type: 'bulletList',
                      content: [
                        {
                          type: 'listItem',
                          content: [
                            {
                              type: 'paragraph',
                              content: [{ ...text('Disconnect power'), marks: [{ type: 'bold' }] }],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(bodyToEditorDocument(editorDocumentToBody(source))).toEqual(source);
    expect(hasInstructionText(editorDocumentToBody(source))).toBe(true);
  });
  it('accepts depth twelve and rejects depth thirteen', () => {
    let withinLimit: unknown = paragraph();
    for (let i = 0; i < 10; i++) withinLimit = { type: 'blockquote', content: [withinLimit] };
    expect(bodyToEditorDocument(editorDocumentToBody(document(withinLimit)))).toEqual(
      document(withinLimit),
    );
    expect(() =>
      editorDocumentToBody(document({ type: 'blockquote', content: [withinLimit] })),
    ).toThrow(/nest|depth/i);
  });
  it('normalizes only safe known editor defaults without losing alignment', () => {
    const source = document({
      type: 'table',
      content: [
        {
          type: 'tableRow',
          content: [
            {
              type: 'tableCell',
              attrs: { colspan: 1, rowspan: 1, colwidth: null, align: 'right' },
              content: [
                {
                  type: 'paragraph',
                  attrs: { textAlign: null },
                  content: [
                    {
                      ...text(),
                      marks: [
                        {
                          type: 'link',
                          attrs: {
                            href: 'mailto:a@example.com',
                            target: null,
                            rel: 'noopener noreferrer nofollow',
                            class: null,
                          },
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(bodyToEditorDocument(editorDocumentToBody(source))).toEqual(
      document({
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [
              {
                type: 'tableCell',
                attrs: { align: 'right' },
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        ...text(),
                        marks: [{ type: 'link', attrs: { href: 'mailto:a@example.com' } }],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }),
    );
  });
  it.each([
    'javascript:alert(1)',
    'data:text/html,a',
    '//example.com',
    'https://safe.test\n',
    'file:///etc/passwd',
  ])('rejects unsafe link %s', (href) => {
    expect(() =>
      editorDocumentToBody(
        document({
          type: 'paragraph',
          content: [{ ...text(), marks: [{ type: 'link', attrs: { href } }] }],
        }),
      ),
    ).toThrow();
  });
  it('rejects structural ambiguity, unknown attributes, spans and unsupported nodes', () => {
    const ragged = table();
    ragged.content[1]!.content.pop();
    const cases = [
      document(ragged),
      document({ type: 'paragraph', attrs: { onclick: 'alert(1)' }, content: [text()] }),
      document({ type: 'image', attrs: { src: 'https://tracker.test' } }),
      document({ type: 'panel', attrs: { tone: 'info' }, content: [panel()] }),
      document({
        type: 'table',
        content: [
          {
            type: 'tableRow',
            content: [{ type: 'tableCell', attrs: { colspan: 2 }, content: [paragraph()] }],
          },
        ],
      }),
      document({ type: 'paragraph', content: [{ type: 'paragraph' }] }),
      document({ type: 'listItem', content: [paragraph()] }),
    ];
    for (const source of cases) expect(() => editorDocumentToBody(source)).toThrow();
  });
  it('bounds depth, node count and total text without recursive overflows', () => {
    let deep: unknown = paragraph();
    for (let i = 0; i < 10000; i++) deep = { type: 'blockquote', content: [deep] };
    expect(() => editorDocumentToBody(document(deep))).toThrow(/nest|depth/i);
    expect(() =>
      editorDocumentToBody(document(...Array.from({ length: 2001 }, () => paragraph()))),
    ).toThrow();
    expect(() =>
      editorDocumentToBody(
        document(...Array.from({ length: 11 }, () => paragraph('x'.repeat(10000)))),
      ),
    ).toThrow();
  });
  it('recognizes empty rich blocks and line breaks as having no instructions', () => {
    expect(
      hasInstructionText(
        editorDocumentToBody(document({ type: 'paragraph', content: [{ type: 'hardBreak' }] })),
      ),
    ).toBe(false);
  });
  it('requires the exclusive rich wrapper in V3 and preserves historical version rules', () => {
    const body = editorDocumentToBody(document(paragraph()));
    const base = {
      schemaVersion: 3,
      title: 'Test',
      summary: 'Guide test',
      locale: 'en',
      difficulty: 'easy',
      durationMinutes: 1,
      tools: [],
      steps: [
        {
          id: '10000000-0000-4000-8000-000000000001',
          title: 'Step',
          body,
          media: [],
          callouts: [],
        },
      ],
    };
    expect(guideDocumentSchema.safeParse(base).success).toBe(true);
    expect(guideDocumentSchema.safeParse({ ...base, schemaVersion: 2 }).success).toBe(false);
    expect(guideDocumentSchema.safeParse({ ...base, schemaVersion: 1 }).success).toBe(false);
    expect(
      guideDocumentSchema.safeParse({
        ...base,
        steps: [
          {
            ...base.steps[0],
            body: [
              ...body,
              { type: 'paragraph', children: [{ type: 'text', text: 'Mix', marks: [] }] },
            ],
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      richDocumentSchema.safeParse(document({ type: 'paragraph', attrs: { textAlign: null } }))
        .success,
    ).toBe(false);
  });
});

describe('lossless legacy content import', () => {
  it('preserves marks, line breaks, blank paragraphs, old lists, panels, quotes and table alignment', () => {
    const run = {
      type: 'text' as const,
      text: 'Bold\ncode',
      marks: ['bold', 'italic', 'code'] as ('bold' | 'italic' | 'code')[],
    };
    const body: GuideStep['body'] = [
      { type: 'paragraph', children: [run] },
      { type: 'paragraph', children: [{ type: 'text', text: '', marks: [] }] },
      { type: 'bulletList', items: ['Keep\nthis'] },
      { type: 'list', ordered: true, start: 3, items: [[run]] },
      {
        type: 'panel',
        tone: 'warning',
        children: [{ type: 'heading', level: 2, children: [run] }],
      },
      { type: 'quote', children: [{ type: 'paragraph', children: [run] }] },
      { type: 'table', headers: [[run]], rows: [[[run]]], align: ['right'] },
    ];
    const imported = bodyToEditorDocument(body);
    expect(imported.content[0]).toEqual({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: 'Bold',
          marks: [{ type: 'bold' }, { type: 'italic' }, { type: 'code' }],
        },
        { type: 'hardBreak', marks: [{ type: 'bold' }, { type: 'italic' }, { type: 'code' }] },
        {
          type: 'text',
          text: 'code',
          marks: [{ type: 'bold' }, { type: 'italic' }, { type: 'code' }],
        },
      ],
    });
    expect(imported.content[1]).toEqual({ type: 'paragraph', content: [] });
    expect(imported.content[3]).toMatchObject({ type: 'orderedList', attrs: { start: 3 } });
    expect(imported.content[6]).toMatchObject({
      type: 'table',
      content: [
        { content: [{ attrs: { align: 'right' } }] },
        { content: [{ attrs: { align: 'right' } }] },
      ],
    });
    expect(bodyToEditorDocument(editorDocumentToBody(imported))).toEqual(imported);
  });
});
