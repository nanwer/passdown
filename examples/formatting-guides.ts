import {
  guideDocumentSchema,
  type GuideDocument,
  type RichBlock,
  type RichInline,
  type RichMark,
  type RichPanelTone,
} from '../packages/guide-content/src/index';

const text = (value: string, ...marks: RichMark[]): RichInline => ({
  type: 'text',
  text: value,
  ...(marks.length ? { marks } : {}),
});
const p = (...content: (string | RichInline)[]): RichBlock => ({
  type: 'paragraph',
  content: content.map((value) => (typeof value === 'string' ? text(value) : value)),
});
const heading = (level: number, value: string): RichBlock => ({
  type: 'heading',
  attrs: { level },
  content: [text(value)],
});
const list = (ordered: boolean, ...items: (string | RichBlock[])[]): RichBlock =>
  ({
    type: ordered ? 'orderedList' : 'bulletList',
    ...(ordered ? { attrs: { start: 1 } } : {}),
    content: items.map((item) => ({
      type: 'listItem',
      content: typeof item === 'string' ? [p(item)] : item,
    })),
  }) as RichBlock;
const panel = (tone: RichPanelTone, ...content: RichBlock[]): RichBlock => ({
  type: 'panel',
  attrs: { tone },
  content,
});
const table = (headers: string[], rows: (string | RichBlock[])[][]): RichBlock => ({
  type: 'table',
  content: [
    {
      type: 'tableRow',
      content: headers.map((value) => ({ type: 'tableHeader', content: [p(value)] })),
    },
    ...rows.map((row) => ({
      type: 'tableRow' as const,
      content: row.map((value) => ({
        type: 'tableCell' as const,
        content: typeof value === 'string' ? [p(value)] : value,
      })),
    })),
  ],
});
function step(id: number, title: string, content: RichBlock[]) {
  return {
    id: `18e00000-0000-4000-8000-${String(id).padStart(12, '0')}`,
    title,
    body: [{ type: 'richText', document: { type: 'doc', content } }],
    media: [],
    callouts: [],
  };
}

export const formattingExamples: { key: string; category: string; document: GuideDocument }[] = [
  {
    key: 'formatting-showcase-v1',
    category: 'Formatting examples',
    document: guideDocumentSchema.parse({
      schemaVersion: 3,
      title: 'Rich-text showcase: every format in the reader',
      summary:
        'A published example of headings, emphasis, links, nested lists, quotes, all six panel types, and rich tables. Open each step to see the actual reader output.',
      locale: 'en',
      difficulty: 'easy',
      durationMinutes: 5,
      tools: [],
      steps: [
        step(101, 'Text, emphasis and links', [
          heading(2, 'Small details, clear instructions'),
          p(
            'This is a real published example. Every style below is stored as editable rich text and rendered by the same reader used for your guides.',
          ),
          p(
            'Use ',
            text('bold for the action', { type: 'bold' }),
            ', ',
            text('italics for emphasis', { type: 'italic' }),
            ', and ',
            text('underline for a key detail', { type: 'underline' }),
            '.',
          ),
          p(
            'An old label can be shown as ',
            text('miscellaneous parts', { type: 'strike' }),
            ' and replaced with ',
            text('sorted components', { type: 'bold' }),
            '. An exact identifier looks like ',
            text('TRAY-A', { type: 'code' }),
            '.',
          ),
          p(
            'Formatting can combine: ',
            text('bold and italic', { type: 'bold' }, { type: 'italic' }),
            '; ',
            text('underlined emphasis', { type: 'underline' }, { type: 'italic' }),
            '.',
          ),
          p(
            'This is a link to the ',
            text('Tiptap editor website', { type: 'link', attrs: { href: 'https://tiptap.dev/' } }),
            '. Links keep their destination after publication.',
          ),
          p(
            'First line in one paragraph.',
            { type: 'hardBreak' },
            'Second line, inserted with Shift+Enter.',
          ),
        ]),
        step(102, 'Headings and document structure', [
          p(
            'The following samples deliberately show all six heading levels. In a normal guide, choose levels that describe the structure rather than using headings only to enlarge text.',
          ),
          ...[1, 2, 3, 4, 5, 6].flatMap((level) => [
            heading(level, `Heading ${level} — a section label`),
            p(
              `Body text beneath heading ${level}. The step title and guide title remain separate from these instruction headings.`,
            ),
          ]),
        ]),
        step(103, 'Lists, nested details and a quote', [
          heading(2, 'A checklist-shaped explanation'),
          list(
            false,
            'Clear the writing area.',
            [
              p('Group related supplies.'),
              list(false, 'Keep labels together.', 'Put small items in a tray.'),
            ],
            'Leave space for the next step.',
          ),
          heading(3, 'An ordered sequence'),
          list(
            true,
            'Read the whole step.',
            [
              p('Complete one action at a time.'),
              list(false, 'Pause when a condition is unclear.', 'Record any exception.'),
            ],
            'Check the expected result.',
          ),
          {
            type: 'blockquote',
            content: [
              p('Make the next action easy to understand.'),
              p(text('A short quoted principle for this example.', { type: 'italic' })),
            ],
          },
        ]),
        step(104, 'All six information panels', [
          p(
            'Each panel communicates a different kind of information. Its icon and label remain visible in the published reader.',
          ),
          panel(
            'info',
            p(
              text('Info: ', { type: 'bold' }),
              'Helpful context for the task. This guide is an example of the formatting module.',
            ),
          ),
          panel(
            'note',
            p(text('Note: ', { type: 'bold' }), 'Remember to label the tray before adding parts.'),
          ),
          panel(
            'success',
            p(
              text('Success: ', { type: 'bold' }),
              'The expected result is a clear, labeled workspace.',
            ),
          ),
          panel(
            'warning',
            p(
              text('Warning: ', { type: 'bold' }),
              'Check the label before moving an item to a different tray.',
            ),
          ),
          panel(
            'danger',
            p(
              text('Error: ', { type: 'bold' }),
              'If the inventory count does not match, stop this example sequence and recount.',
            ),
          ),
          panel(
            'decision',
            heading(3, 'Keep or reorganize?'),
            p('Choose the arrangement that makes the next action clearer.'),
            list(
              false,
              'Keep the layout when every item has a clear place.',
              'Reorganize when two labels could be confused.',
            ),
          ),
        ]),
        step(105, 'Tables with rich content inside cells', [
          heading(2, 'A compact preparation matrix'),
          p(
            'Table cells can contain formatting, lists, links and panels. On a narrow screen, scroll the table sideways to see every column.',
          ),
          table(
            ['Item', 'Preparation', 'Expected result'],
            [
              [
                [p(text('Labels', { type: 'bold' }), ' · ', text('TRAY-A', { type: 'code' }))],
                [list(false, 'Write a short name.', 'Keep the lettering readable.')],
                [panel('success', p('Each tray has one clear label.'))],
              ],
              [
                'Small parts tray',
                [p('Keep ', text('related items together', { type: 'italic' }), '.')],
                [panel('warning', p('Do not mix items with similar names.'))],
              ],
              [
                'Reference note',
                [
                  p(
                    'See the ',
                    text('editor reference', {
                      type: 'link',
                      attrs: { href: 'https://tiptap.dev/' },
                    }),
                    '.',
                  ),
                ],
                [panel('info', p('The note remains readable inside this cell.'))],
              ],
            ],
          ),
          p(
            'The published table contains the document only. Editing handles, insertion buttons and authoring menus do not appear here.',
          ),
        ]),
      ],
    }),
  },
  {
    key: 'workspace-example-v1',
    category: 'Formatting examples',
    document: guideDocumentSchema.parse({
      schemaVersion: 3,
      title: 'Prepare a tidy workspace — formatting example',
      summary:
        'A practical, three-step example showing how headings, lists, decision panels, warnings and a table work together in a published guide.',
      locale: 'en',
      difficulty: 'easy',
      durationMinutes: 10,
      tools: ['Small parts tray', 'Reusable labels', 'Pen'],
      steps: [
        step(201, 'Create room for the task', [
          heading(2, 'Start with a clear surface'),
          p(
            'Move unrelated items aside and leave enough room for the ',
            text('task area', { type: 'bold' }),
            ', a parts tray and your notes.',
          ),
          list(
            true,
            'Choose a well-lit surface.',
            'Place the tray within easy reach.',
            'Keep a separate area for items awaiting a decision.',
          ),
          panel(
            'info',
            p('This is a formatting demonstration, not a repair procedure for a specific product.'),
          ),
          { type: 'blockquote', content: [p('A useful workspace makes the next action obvious.')] },
        ]),
        step(202, 'Label and arrange the supplies', [
          p(
            'Use short labels such as ',
            text('READY', { type: 'code' }),
            ' and ',
            text('REVIEW', { type: 'code' }),
            '. Write them before placing items in the trays.',
          ),
          table(
            ['Area', 'What belongs here', 'Check'],
            [
              [
                'Ready',
                [list(false, 'Supplies for the next action.', 'Clearly identified small items.')],
                [panel('success', p('The label matches the contents.'))],
              ],
              [
                'Review',
                [p('Items that need ', text('another look', { type: 'italic' }), '.')],
                [panel('warning', p('Keep uncertain items separate.'))],
              ],
              [
                'Notes',
                'The current checklist and any open questions.',
                'Leave enough room to write.',
              ],
            ],
          ),
          panel(
            'note',
            p(
              'Cross out an outdated label with ',
              text('old wording', { type: 'strike' }),
              ' before writing its replacement.',
            ),
          ),
        ]),
        step(203, 'Check the result and hand over', [
          heading(2, 'Ready for the next person'),
          list(
            false,
            [p(text('Readable labels:', { type: 'bold' }), ' each area has one clear purpose.')],
            [p(text('Complete count:', { type: 'bold' }), ' all listed items are accounted for.')],
            [p(text('Clear next action:', { type: 'bold' }), ' open questions are written down.')],
          ),
          panel(
            'decision',
            heading(3, 'Is the layout clear?'),
            p(
              'If another person can identify each area without an explanation, keep it. Otherwise, improve the labels before handing over.',
            ),
          ),
          panel(
            'danger',
            p(
              'If an item is missing, mark the handover incomplete and record what needs to be found.',
            ),
          ),
          panel(
            'success',
            p(
              text('Finished: ', { type: 'bold' }),
              'the next person can see where everything belongs.',
            ),
          ),
          p(
            text('Handover note', { type: 'underline' }),
            ': add the date, the next action and any unresolved question.',
          ),
        ]),
      ],
    }),
  },
];
