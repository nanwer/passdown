import { z } from 'zod';
import type { GuideDocument, GuideDocumentV4 } from './index';

export const requirementUnits = ['each', 'pair', 'g', 'kg', 'ml', 'l', 'mm', 'cm', 'm'] as const;
export const requirementUnitSchema = z.enum(requirementUnits);
const quantitySchema = z.number().positive().max(1000000000).nullable();
export const guideRequirementSchema = z
  .strictObject({
    id: z.uuid(),
    itemId: z.uuid(),
    itemVersion: z.number().int().positive(),
    kind: z.enum(['tool', 'material', 'part']),
    name: z.string().trim().min(1).max(160),
    specification: z.string().max(500),
    description: z.string().max(2000),
    manufacturer: z.string().max(160).default(''),
    model: z.string().max(160).default(''),
    partNumber: z.string().max(160).default(''),
    quantity: quantitySchema,
    unit: requirementUnitSchema,
    optional: z.boolean(),
    notes: z.string().max(2000),
  })
  .superRefine((requirement, context) => {
    if (requirement.kind !== 'tool') return;
    if (requirement.quantity !== null && !Number.isInteger(requirement.quantity))
      context.addIssue({
        code: 'custom',
        path: ['quantity'],
        message: 'Tools need a whole-number count, or choose As needed.',
      });
    if (!['each', 'pair'].includes(requirement.unit))
      context.addIssue({ code: 'custom', path: ['unit'], message: 'Tools use each or pair.' });
  });
export const stepRequirementUsageSchema = z.strictObject({
  requirementId: z.uuid(),
  quantity: quantitySchema,
  unit: requirementUnitSchema,
  mode: z.enum(['consume', 'reuse']),
  optional: z.boolean(),
  notes: z.string().max(2000),
});
export const guidePreconditionSchema = z.strictObject({
  id: z.uuid(),
  text: z.string().trim().min(1).max(2000),
  tone: z.enum(['info', 'warning']),
});
export const structuredStepFields = {
  requirements: z.array(stepRequirementUsageSchema).max(100),
  preconditions: z.array(guidePreconditionSchema).max(20),
  earlierStepIds: z.array(z.uuid()).max(99),
};
export type GuideRequirement = z.infer<typeof guideRequirementSchema>;
export type StepRequirementUsage = z.infer<typeof stepRequirementUsageSchema>;
export type GuidePrecondition = z.infer<typeof guidePreconditionSchema>;
export type RequirementUnit = z.infer<typeof requirementUnitSchema>;
export type RequirementIssue = { path: (string | number)[]; message: string };

/** Preserve legacy wording without guessing item identity, type or quantity. */
export function toStructuredDocument(
  document: GuideDocument,
  idFactory = () => crypto.randomUUID(),
): GuideDocumentV4 {
  if (document.schemaVersion === 4) return document;
  return {
    ...document,
    schemaVersion: 4,
    tools: [],
    requirements: [],
    unresolvedTools: document.tools.map((label) => ({ id: idFactory(), label })),
    steps: document.steps.map((step) => ({
      ...step,
      requirements: [],
      preconditions: [],
      earlierStepIds: [],
    })),
  };
}

/** Publication rules are separate from shape validation so incomplete drafts remain repairable. */
export function getRequirementIssues(document: GuideDocument): RequirementIssue[] {
  if (document.schemaVersion !== 4) return [];
  const issues: RequirementIssue[] = [];
  const add = (path: (string | number)[], message: string) => issues.push({ path, message });
  document.unresolvedTools.forEach((entry, index) =>
    add(
      ['unresolvedTools', index],
      `Link “${entry.label}” to a catalog item or remove it before publishing.`,
    ),
  );
  const ids = new Set<string>();
  const itemIds = new Set<string>();
  document.requirements.forEach((entry, index) => {
    if (ids.has(entry.id))
      add(['requirements', index, 'id'], 'Every preparation requirement needs a unique ID.');
    if (itemIds.has(entry.itemId))
      add(
        ['requirements', index, 'itemId'],
        `“${entry.name}” is already in the preparation list. Keep one requirement and assign it to the relevant steps.`,
      );
    ids.add(entry.id);
    itemIds.add(entry.itemId);
  });
  const consumption = new Map<string, number>();
  document.steps.forEach((step, stepIndex) => {
    const earlier = new Set<string>();
    step.earlierStepIds.forEach((id, index) => {
      const target = document.steps.findIndex((candidate) => candidate.id === id);
      if (target < 0)
        add(
          ['steps', stepIndex, 'earlierStepIds', index],
          `Step ${stepIndex + 1} refers to a deleted earlier step. Remove or replace that prerequisite.`,
        );
      else if (target >= stepIndex)
        add(
          ['steps', stepIndex, 'earlierStepIds', index],
          `Step ${stepIndex + 1} can only depend on a step before it. Reorder the steps or remove that prerequisite.`,
        );
      if (earlier.has(id))
        add(
          ['steps', stepIndex, 'earlierStepIds', index],
          'This earlier step is already selected.',
        );
      earlier.add(id);
    });
    const preconditions = new Set<string>();
    step.preconditions.forEach((condition, index) => {
      if (preconditions.has(condition.id))
        add(
          ['steps', stepIndex, 'preconditions', index, 'id'],
          'Each precondition needs a unique ID.',
        );
      preconditions.add(condition.id);
    });
    const selected = new Set<string>();
    step.requirements.forEach((usage, usageIndex) => {
      const path = ['steps', stepIndex, 'requirements', usageIndex];
      const requirement = document.requirements.find((entry) => entry.id === usage.requirementId);
      if (!requirement) {
        add(
          path,
          `Step ${stepIndex + 1} uses a removed preparation item. Remove or replace this selection.`,
        );
        return;
      }
      if (selected.has(requirement.id))
        add(path, `“${requirement.name}” is already selected for this step.`);
      selected.add(requirement.id);
      if (usage.unit !== requirement.unit)
        add(
          [...path, 'unit'],
          `Step ${stepIndex + 1}: use ${requirement.unit} for “${requirement.name}”, matching its guide total. Units are never converted automatically.`,
        );
      if (requirement.optional && !usage.optional)
        add(
          [...path, 'optional'],
          `“${requirement.name}” is optional in preparation. Mark this usage optional or make the guide requirement required.`,
        );
      if (requirement.kind === 'tool' && usage.mode !== 'reuse')
        add([...path, 'mode'], 'Tools are reused, not consumed.');
      if (
        requirement.kind === 'tool' &&
        usage.quantity !== null &&
        !Number.isInteger(usage.quantity)
      )
        add([...path, 'quantity'], 'Tools need a whole-number count.');
      if (
        usage.quantity !== null &&
        requirement.quantity !== null &&
        usage.quantity > requirement.quantity
      )
        add(
          [...path, 'quantity'],
          `Step ${stepIndex + 1} needs more “${requirement.name}” than the confirmed guide total.`,
        );
      if (usage.mode === 'consume' && usage.quantity !== null && usage.unit === requirement.unit)
        consumption.set(requirement.id, (consumption.get(requirement.id) ?? 0) + usage.quantity);
    });
  });
  document.requirements.forEach((entry, index) => {
    const consumed = consumption.get(entry.id) ?? 0;
    // Floating point tolerance permits 0.1 + 0.2 against an explicit 0.3 total.
    if (entry.quantity !== null && consumed - entry.quantity > Math.max(1, entry.quantity) * 1e-10)
      add(
        ['requirements', index, 'quantity'],
        `“${entry.name}” allocates ${formatRequirementQuantity(consumed, entry.unit)} across steps, above the confirmed guide total of ${formatRequirementQuantity(entry.quantity, entry.unit)}. Increase the total or reduce the allocations.`,
      );
  });
  return issues;
}

export function formatRequirementQuantity(quantity: number | null, unit: RequirementUnit): string {
  if (quantity === null) return 'As needed';
  const amount = new Intl.NumberFormat('en', { maximumSignificantDigits: 15 }).format(quantity);
  return `${amount} ${unit === 'pair' && quantity !== 1 ? 'pairs' : unit}`;
}
export function allocatedRequirementQuantity(
  document: GuideDocumentV4,
  requirementId: string,
): number {
  const requirement = document.requirements.find((entry) => entry.id === requirementId);
  return document.steps
    .flatMap((step) => step.requirements)
    .reduce(
      (sum, usage) =>
        usage.requirementId === requirementId &&
        usage.mode === 'consume' &&
        usage.quantity !== null &&
        usage.unit === requirement?.unit
          ? sum + usage.quantity
          : sum,
      0,
    );
}
