import { describe, expect, it } from 'vitest';
import { guideDocumentSchema } from './index';
const step = {
  id: '10000000-0000-4000-8000-000000000001',
  title: 'Prepare your space',
  body: [{ type: 'paragraph', children: [{ type: 'text', text: 'Clear the bench.', marks: [] }] }],
  media: [],
  callouts: [],
};
const valid = {
  schemaVersion: 1,
  title: 'A sample procedure',
  summary: 'A short original demonstration.',
  locale: 'en',
  difficulty: 'easy',
  durationMinutes: 15,
  tools: ['Soft cloth'],
  steps: [step],
};
describe('versioned guide content', () => {
  it('accepts structured content and preserves stable step identity', () => {
    expect(guideDocumentSchema.parse(valid)).toEqual(valid);
  });
  it.each([
    ['unknown schema version', { ...valid, schemaVersion: 5 }],
    ['duplicate step IDs', { ...valid, steps: [step, step] }],
    [
      'arbitrary HTML',
      {
        ...valid,
        steps: [{ ...step, body: [{ type: 'html', html: '<script>alert(1)</script>' }] }],
      },
    ],
    [
      'unapproved marks',
      {
        ...valid,
        steps: [
          {
            ...step,
            body: [
              { type: 'paragraph', children: [{ type: 'text', text: 'Open', marks: ['onclick'] }] },
            ],
          },
        ],
      },
    ],
    ['empty guide', { ...valid, steps: [] }],
    [
      'too many steps',
      {
        ...valid,
        steps: Array.from({ length: 101 }, (_, i) => ({
          ...step,
          id: `10000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
        })),
      },
    ],
    [
      'remote media paths',
      {
        ...valid,
        steps: [
          {
            ...step,
            media: [{ assetId: step.id, alt: 'Example', src: 'https://example.com/private' }],
          },
        ],
      },
    ],
    [
      'out-of-bounds annotation',
      {
        ...valid,
        steps: [
          {
            ...step,
            media: [
              {
                assetId: step.id,
                alt: 'Example',
                annotations: [{ type: 'pin', x: 1.5, y: 0.5, label: '1' }],
              },
            ],
          },
        ],
      },
    ],
  ])('rejects %s', (_, input) => {
    expect(guideDocumentSchema.safeParse(input).success).toBe(false);
  });
});

it('accepts new formatted headings only in V2 while keeping V1 releases unchanged', () => {
  const heading = {
    type: 'heading',
    level: 2,
    children: [{ type: 'text', text: 'Before you start', marks: [] }],
  };
  const v2 = { ...valid, schemaVersion: 2, steps: [{ ...step, body: [heading] }] };
  expect(guideDocumentSchema.safeParse(v2).success).toBe(true);
  expect(guideDocumentSchema.safeParse({ ...v2, schemaVersion: 1 }).success).toBe(false);
  expect(guideDocumentSchema.parse(valid)).toEqual(valid);
});
