import { describe, expect, it } from 'vitest';
import { formatStepMarkdown, parseStepMarkdown, stepBodySchema, type GuideStep } from './index';
const text = (value: string, marks: ('bold' | 'italic' | 'code')[] = []) => ({
  type: 'text' as const,
  text: value,
  marks,
});
describe('step Markdown', () => {
  it('preserves paragraph inline emphasis, nested marks and code as safe structured runs', () => {
    expect(parseStepMarkdown('Use **firm** and *gentle* pressure with `PH #00`.').body).toEqual([
      {
        type: 'paragraph',
        children: [
          text('Use '),
          text('firm', ['bold']),
          text(' and '),
          text('gentle', ['italic']),
          text(' pressure with '),
          text('PH #00', ['code']),
          text('.'),
        ],
      },
    ]);
    expect(parseStepMarkdown('***Carefully***').body).toEqual([
      { type: 'paragraph', children: [text('Carefully', ['bold', 'italic'])] },
    ]);
  });
  it('keeps headings, rich bullet items and ordered starting numbers', () => {
    expect(
      parseStepMarkdown(
        '## Prepare\n\n- **Turn off** power\n- Remove cover\n\n3. Undo screws\n4. Lift panel',
      ),
    ).toEqual({
      body: [
        { type: 'heading', level: 2, children: [text('Prepare')] },
        {
          type: 'list',
          ordered: false,
          start: 1,
          items: [[text('Turn off', ['bold']), text(' power')], [text('Remove cover')]],
        },
        {
          type: 'list',
          ordered: true,
          start: 3,
          items: [[text('Undo screws')], [text('Lift panel')]],
        },
      ],
      needsV2: true,
      notices: [],
    });
  });
  it('roundtrips V1 paragraph marks and literal bullet contents without interpreting existing text as Markdown', () => {
    const body: GuideStep['body'] = [
      {
        type: 'paragraph',
        children: [
          text('Use '),
          text('bold', ['bold']),
          text(' and '),
          text('care', ['italic']),
          text(' with '),
          text('code`sample', ['code']),
          text(' <span> and **literal**.'),
        ],
      },
      {
        type: 'bulletList',
        items: ['Use *only* 2 screws', '[literal](javascript:alert)', '# Not a heading'],
      },
    ];
    expect(parseStepMarkdown(formatStepMarkdown(body)).body).toEqual(body);
  });
  it.each([
    '[click](javascript:alert(1))',
    '<script>alert(1)</script>',
    '![remote](https://tracker.test/a.png)',
    '```html\n<iframe src=x>\n```',
    '- Outer\n  - Nested',
  ])('retains unsupported syntax as literal source: %s', (source) => {
    const result = parseStepMarkdown(source);
    expect(result.body).toEqual([{ type: 'paragraph', children: [text(source)] }]);
    expect(result.notices.length).toBeGreaterThan(0);
    expect(parseStepMarkdown(formatStepMarkdown(result.body)).body).toEqual(result.body);
  });
  it('keeps escaped punctuation and line breaks as text', () => {
    expect(parseStepMarkdown('Use \\*literal\\* stars.\nKeep this line.').body).toEqual([
      { type: 'paragraph', children: [text('Use *literal* stars.\nKeep this line.')] },
    ]);
  });
  it('roundtrips formatted V2 body without losing list item marks', () => {
    const body: GuideStep['body'] = [
      { type: 'heading', level: 1, children: [text('Read ', []), text('first', ['italic'])] },
      {
        type: 'list',
        ordered: true,
        start: 7,
        items: [[text('Keep ', []), text('safe', ['bold'])], [text('PH00', ['code'])]],
      },
    ];
    expect(parseStepMarkdown(formatStepMarkdown(body)).body).toEqual(body);
  });
  it('bounds body size and rejects executable or unknown nodes', () => {
    expect(() => parseStepMarkdown('a'.repeat(100001))).toThrow();
    expect(
      stepBodySchema.safeParse([{ type: 'heading', level: 7, children: [text('x')] }]).success,
    ).toBe(false);
    expect(stepBodySchema.safeParse([{ type: 'link', href: 'javascript:alert(1)' }]).success).toBe(
      false,
    );
  });
});

describe('rich instruction blocks', () => {
  it.each([
    ['NOTE', 'info'],
    ['WARNING', 'warning'],
    ['CAUTION', 'danger'],
    ['TIP', 'success'],
    ['DECISION', 'decision'],
  ])('parses and roundtrips %s panels', (marker, tone) => {
    const source = `> [!${marker}]\n> **Stop** and check.\n>\n> - Power off\n> - Cover removed`;
    const body = [
      {
        type: 'panel',
        tone,
        children: [
          { type: 'paragraph', children: [text('Stop', ['bold']), text(' and check.')] },
          { type: 'bulletList', items: ['Power off', 'Cover removed'] },
        ],
      },
    ];
    expect(parseStepMarkdown(source).body).toEqual(body);
    expect(parseStepMarkdown(formatStepMarkdown(body as GuideStep['body'])).body).toEqual(body);
  });
  it('keeps ordinary quotes distinct from notices', () => {
    const body = [
      {
        type: 'quote',
        children: [
          { type: 'paragraph', children: [text('Measure '), text('twice', ['italic']), text('.')] },
        ],
      },
    ];
    expect(parseStepMarkdown('> Measure *twice*.').body).toEqual(body);
    expect(parseStepMarkdown(formatStepMarkdown(body as GuideStep['body'])).body).toEqual(body);
  });
  it('roundtrips table headings, formatting, literal pipes and alignment', () => {
    const body = [
      {
        type: 'table',
        headers: [[text('Item')], [text('Quantity')]],
        rows: [[[text('PH | 00', ['code'])], [text('2', ['bold'])]]],
        align: ['left', 'right'],
      },
    ];
    expect(
      parseStepMarkdown('| Item | Quantity |\n| :--- | ---: |\n| `PH \\| 00` | **2** |').body,
    ).toEqual(body);
    expect(parseStepMarkdown(formatStepMarkdown(body as GuideStep['body'])).body).toEqual(body);
  });
  it('bounds tables and rejects malformed row widths', () => {
    expect(
      stepBodySchema.safeParse([
        {
          type: 'table',
          headers: [[text('A')]],
          rows: [[[text('a')], [text('b')]]],
          align: [null],
        },
      ]).success,
    ).toBe(false);
  });
});

it('preserves adjacent and empty legacy marked runs without introducing Markdown characters', () => {
  expect(
    parseStepMarkdown(
      formatStepMarkdown([
        {
          type: 'paragraph',
          children: [
            text('a', ['bold']),
            text('b', ['bold']),
            text('', ['code']),
            text('', ['bold']),
          ],
        },
      ]),
    ).body,
  ).toEqual([{ type: 'paragraph', children: [text('ab', ['bold'])] }]);
});
it('preserves multiline paragraphs and marked leading/trailing whitespace', () => {
  const body: GuideStep['body'] = [{ type: 'paragraph', children: [text(' a\n\nb ', ['bold'])] }];
  expect(parseStepMarkdown(formatStepMarkdown(body)).body).toEqual(body);
});
it('keeps an escaped panel marker inside an ordinary quote', () => {
  const body: GuideStep['body'] = [
    {
      type: 'quote',
      children: [{ type: 'paragraph', children: [text('[!NOTE]\nordinary quote')] }],
    },
  ];
  expect(parseStepMarkdown(formatStepMarkdown(body)).body).toEqual(body);
});

const markSets: ('bold' | 'italic' | 'code')[][] = [
  [],
  ['bold'],
  ['italic'],
  ['code'],
  ['bold', 'italic'],
  ['bold', 'code'],
  ['code', 'italic'],
  ['bold', 'code', 'italic'],
];
it.each(markSets.flatMap((first) => markSets.map((second) => [first, second])))(
  'roundtrips adjacent mark combinations %j / %j',
  (first, second) => {
    const body: GuideStep['body'] = [
      { type: 'paragraph', children: [text('a', first), text('b', second)] },
    ];
    const expected = [
      {
        type: 'paragraph',
        children:
          first.join() === second.join()
            ? [text('ab', first)]
            : [text('a', first), text('b', second)],
      },
    ];
    expect(parseStepMarkdown(formatStepMarkdown(body)).body).toEqual(expected);
  },
);
it('preserves crossing emphasis spans across three adjacent runs', () => {
  for (const first of markSets)
    for (const second of markSets)
      for (const third of markSets) {
        const body: GuideStep['body'] = [
          { type: 'paragraph', children: [text('a', first), text('b', second), text('c', third)] },
        ];
        const parsed = parseStepMarkdown(formatStepMarkdown(body)).body[0];
        expect(parsed.type).toBe('paragraph');
        if (parsed.type !== 'paragraph') continue;
        const characters = parsed.children.flatMap((run) =>
          Array.from(run.text, (char) => ({ char, marks: run.marks })),
        );
        expect(characters).toEqual([
          { char: 'a', marks: first },
          { char: 'b', marks: second },
          { char: 'c', marks: third },
        ]);
      }
});
it('preserves both boundaries when a marked run contains nested emphasis', () => {
  const body: GuideStep['body'] = [
    {
      type: 'paragraph',
      children: [text(' a', ['bold']), text('b', ['bold', 'italic']), text('c ', ['bold'])],
    },
  ];
  expect(parseStepMarkdown(formatStepMarkdown(body)).body).toEqual(body);
});
