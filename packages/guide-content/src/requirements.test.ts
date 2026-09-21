import { describe, expect, it } from 'vitest';
import {
  getRequirementIssues,
  formatRequirementQuantity,
  guideDocumentSchema,
  toStructuredDocument,
  type GuideDocument,
  type GuideDocumentV5,
  type GuideRequirement,
  type StepRequirementUsage,
} from './index';
const id = (index: number) => `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const legacy: GuideDocument = {
  schemaVersion: 1,
  title: 'Prepare a workspace',
  summary: 'Test document.',
  locale: 'en',
  difficulty: 'easy',
  durationMinutes: 5,
  tools: ['Phillips #00', 'cloth — amount unknown'],
  steps: [
    {
      id: id(1),
      title: 'Prepare',
      body: [
        { type: 'paragraph', children: [{ type: 'text', text: 'Prepare the bench.', marks: [] }] },
      ],
      media: [],
      callouts: [],
    },
  ],
};
const requirement = (changes: Partial<GuideRequirement> = {}): GuideRequirement => ({
  id: id(10),
  itemId: id(20),
  itemVersion: 1,
  role: 'keep',
  name: 'Screwdriver',
  specification: 'Phillips #00',
  description: 'An exact size.',
  manufacturer: '',
  model: '',
  partNumber: '',
  quantity: 1,
  unit: 'each',
  optional: false,
  notes: '',
  ...changes,
});
const usage = (changes: Partial<StepRequirementUsage> = {}): StepRequirementUsage => ({
  requirementId: id(10),
  quantity: 1,
  unit: 'each',
  mode: 'reuse',
  optional: false,
  notes: '',
  ...changes,
});
function structured(): GuideDocumentV5 {
  const document = toStructuredDocument(legacy, () => id(99));
  return {
    ...document,
    unresolvedTools: [],
    requirements: [requirement()],
    steps: [0, 1, 2].map((index) => ({
      ...document.steps[0]!,
      id: id(index + 1),
      title: `Step ${index + 1}`,
      requirements: [usage()],
    })),
  };
}
describe('structured guide preparation', () => {
  it('keeps small positive measured quantities visible rather than displaying zero', () => {
    expect(formatRequirementQuantity(0.000000001, 'g')).toBe('0.000000001 g');
  });
  it('migrates drafts without guessing identities, quantities or altering legacy releases', () => {
    const original = structuredClone(legacy);
    let sequence = 50;
    const result = toStructuredDocument(legacy, () => id(sequence++));
    expect(result.schemaVersion).toBe(5);
    expect(result.unresolvedTools.map((entry) => entry.label)).toEqual(legacy.tools);
    expect(new Set(result.unresolvedTools.map((entry) => entry.id)).size).toBe(2);
    expect(result.requirements).toEqual([]);
    expect(result.tools).toEqual([]);
    expect(result.steps[0]?.body).toEqual(legacy.steps[0]?.body);
    expect(legacy).toEqual(original);
    expect(toStructuredDocument(result)).toBe(result);
    expect(guideDocumentSchema.parse(result)).toEqual(result);
  });
  it('keeps V1, V2 and V3 snapshots readable while V4 forbids the free text tools field', () => {
    for (const schemaVersion of [1, 2, 3])
      expect(guideDocumentSchema.safeParse({ ...legacy, schemaVersion }).success).toBe(true);
    expect(
      guideDocumentSchema.safeParse({ ...structured(), tools: ['Uncataloged new entry'] }).success,
    ).toBe(false);
  });
  it('allows saving unresolved notes and blocks their publication with a clear repair path', () => {
    const document = toStructuredDocument(legacy, () => id(90));
    expect(guideDocumentSchema.safeParse(document).success).toBe(true);
    expect(getRequirementIssues(document)[0]).toEqual({
      path: ['unresolvedTools', 0],
      message: expect.stringContaining('Link “Phillips #00” to a catalog item'),
    });
  });
  it('uses a reusable tool across sequential steps without adding its counts together', () =>
    expect(getRequirementIssues(structured())).toEqual([]));
  it('rejects fractional tool counts and measurement units without changing material decimals', () => {
    expect(
      guideDocumentSchema.safeParse({
        ...structured(),
        requirements: [requirement({ quantity: 0.5 })],
      }).success,
    ).toBe(false);
    expect(
      guideDocumentSchema.safeParse({
        ...structured(),
        requirements: [requirement({ unit: 'ml' })],
      }).success,
    ).toBe(false);
    expect(
      guideDocumentSchema.safeParse({
        ...structured(),
        requirements: [requirement({ role: 'use', quantity: 0.5, unit: 'ml' })],
      }).success,
    ).toBe(true);
  });
  it('sums explicit consumption but does not count reuse as new material', () => {
    const document = structured();
    document.requirements = [requirement({ role: 'use', quantity: 5 })];
    document.steps[0]!.requirements = [usage({ mode: 'consume', quantity: 2 })];
    document.steps[1]!.requirements = [usage({ mode: 'consume', quantity: 3 })];
    document.steps[2]!.requirements = [usage({ mode: 'reuse', quantity: 5 })];
    expect(getRequirementIssues(document)).toEqual([]);
    document.steps[1]!.requirements[0]!.quantity = 4;
    expect(guideDocumentSchema.safeParse(document).success).toBe(true);
    expect(getRequirementIssues(document)).toContainEqual({
      path: ['requirements', 0, 'quantity'],
      message: expect.stringContaining('allocates 6 each'),
    });
  });
  it('accepts As needed and compatible fractional allocations without rounding errors', () => {
    const document = structured();
    document.requirements = [requirement({ role: 'use', quantity: 0.3, unit: 'l' })];
    document.steps = document.steps.slice(0, 2);
    document.steps.forEach((step, index) => {
      step.requirements = [usage({ mode: 'consume', quantity: index ? 0.2 : 0.1, unit: 'l' })];
    });
    expect(getRequirementIssues(document)).toEqual([]);
    document.requirements[0]!.quantity = null;
    document.steps[0]!.requirements[0]!.quantity = 200;
    expect(getRequirementIssues(document)).toEqual([]);
  });
  it('does not silently convert units or consume tools', () => {
    const document = structured();
    document.steps[0]!.requirements = [usage({ mode: 'consume', unit: 'pair' })];
    expect(getRequirementIssues(document).map((entry) => entry.path.at(-1))).toEqual([
      'unit',
      'mode',
    ]);
  });
  it('flags duplicate selections, missing requirements and required use of an optional item', () => {
    const document = structured();
    document.requirements[0]!.optional = true;
    document.requirements.push(requirement({ id: id(11) }));
    document.steps[0]!.requirements.push(usage(), usage({ requirementId: id(400) }));
    const messages = getRequirementIssues(document)
      .map((entry) => entry.message)
      .join('\n');
    expect(messages).toContain('already in the preparation list');
    expect(messages).toContain('already selected for this step');
    expect(messages).toContain('removed preparation item');
    expect(messages).toContain('optional in preparation');
  });
  it('resolves earlier-step references by stable identity and flags invalid references after moves/deletions', () => {
    const document = structured();
    document.steps[1]!.earlierStepIds = [id(1)];
    expect(getRequirementIssues(document)).toEqual([]);
    document.steps = [document.steps[1]!, document.steps[0]!, document.steps[2]!];
    expect(guideDocumentSchema.safeParse(document).success).toBe(true);
    expect(getRequirementIssues(document)[0]?.message).toContain('only depend on a step before it');
    document.steps = document.steps.filter((step) => step.id !== id(1));
    expect(getRequirementIssues(document)[0]?.message).toContain('deleted earlier step');
  });
  it('retains canonical snapshot details without looking up or refreshing a catalog', () => {
    const document = structured();
    const saved = guideDocumentSchema.parse(document);
    document.requirements[0]!.name = 'A later catalog name';
    if (saved.schemaVersion !== 5) throw new Error('Expected V4');
    expect(saved.requirements[0]?.name).toBe('Screwdriver');
    expect(saved.requirements[0]?.specification).toBe('Phillips #00');
    expect(saved.requirements[0]?.itemVersion).toBe(1);
  });
});
