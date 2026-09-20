import { z } from 'zod';
import { richDocumentSchema } from './rich-text';
import { guideRequirementSchema, structuredStepFields } from './requirements';
export const textRunSchema = z.strictObject({
  type: z.literal('text'),
  text: z.string().max(10000),
  marks: z.array(z.enum(['bold', 'italic', 'code'])).max(3),
});
const paragraph = z.strictObject({
  type: z.literal('paragraph'),
  children: z.array(textRunSchema).min(1).max(100),
});
const bulletList = z.strictObject({
  type: z.literal('bulletList'),
  items: z.array(z.string().min(1).max(2000)).min(1).max(30),
});
/**
 * Annotation coordinates are fractions of the stored image, so a mark stays on
 * the same detail at any rendered size.
 *
 * They are rounded to four places on the way in and converted to a percentage
 * by one shared function on the way out. Repeated nudging otherwise accumulates
 * floating-point noise — 0.5 + 0.02 + 0.02 + 0.005 is 0.545, but times 100 it
 * is 54.50000000000001 — which would both bloat every saved document and let
 * the editor and the reader disagree about where a mark is.
 */
const position = z.number().min(0).max(1);
/** A fraction of the image, to the nearest thousandth of a percent. */
export const annotationPercent = (value: number) => `${Math.round(value * 10000) / 100}%`;
/** The precision a coordinate is stored at: finer than a pixel on any image. */
export const roundPosition = (value: number) => Math.round(value * 10000) / 10000;
const annotation = z.discriminatedUnion('type', [
  z.strictObject({
    type: z.literal('pin'),
    x: position,
    y: position,
    label: z.string().min(1).max(80),
  }),
  z.strictObject({
    type: z.literal('arrow'),
    x: position,
    y: position,
    toX: position,
    toY: position,
    label: z.string().min(1).max(80),
  }),
]);
const media = z.strictObject({
  assetId: z.uuid(),
  /**
   * What the picture shows, for a reader who cannot see it. Required, because
   * a picture with no description is a step some readers cannot follow.
   */
  alt: z.string().min(1).max(500),
  /**
   * A visible line beneath the picture, for everyone. Distinct from `alt`:
   * that stands in for the image, this sits alongside it. Optional, because
   * most pictures in a procedure are explained by the step they belong to.
   *
   * Defaulted rather than required so documents written before captions
   * existed still parse.
   */
  caption: z.string().trim().max(200).default(''),
  annotations: z.array(annotation).max(30).default([]),
});
const heading = z.strictObject({
  type: z.literal('heading'),
  level: z.number().int().min(1).max(6),
  children: z.array(textRunSchema).min(1).max(100),
});
const richList = z.strictObject({
  type: z.literal('list'),
  ordered: z.boolean(),
  start: z.number().int().min(1).max(999999999),
  items: z.array(z.array(textRunSchema).min(1).max(100)).min(1).max(30),
});
const simpleBlock = z.discriminatedUnion('type', [paragraph, bulletList, heading, richList]);
const quote = z.strictObject({
  type: z.literal('quote'),
  children: z.array(simpleBlock).min(1).max(30),
});
const panel = z.strictObject({
  type: z.literal('panel'),
  tone: z.enum(['info', 'warning', 'danger', 'success', 'decision']),
  children: z.array(simpleBlock).min(1).max(30),
});
const tableCell = z.array(textRunSchema).min(1).max(30);
const table = z
  .strictObject({
    type: z.literal('table'),
    headers: z.array(tableCell).min(1).max(10),
    rows: z.array(z.array(tableCell).min(1).max(10)).max(50),
    align: z
      .array(z.enum(['left', 'center', 'right']).nullable())
      .min(1)
      .max(10),
  })
  .superRefine((value, context) => {
    if (
      value.align.length !== value.headers.length ||
      value.rows.some((row) => row.length !== value.headers.length)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Every table row and its alignment must match the header width.',
      });
    }
  });
export const legacyFormattedBodySchema = z
  .array(
    z.discriminatedUnion('type', [paragraph, bulletList, heading, richList, quote, panel, table]),
  )
  .min(1)
  .max(50);
export const stepBodySchema = z.union([
  legacyFormattedBodySchema,
  z.tuple([z.strictObject({ type: z.literal('richText'), document: richDocumentSchema })]),
]);
const stepFields = {
  id: z.uuid(),
  title: z.string().trim().min(1).max(160),

  media: z.array(media).max(10),
  callouts: z
    .array(
      z.strictObject({
        tone: z.enum(['info', 'warning']),
        title: z.string().min(1).max(120),
        body: z.string().min(1).max(2000),
      }),
    )
    .max(10),
};
const legacyGuideStepSchema = z.strictObject({
  ...stepFields,
  body: z
    .array(z.discriminatedUnion('type', [paragraph, bulletList]))
    .min(1)
    .max(50),
});
export const guideStepSchema = z.strictObject({ ...stepFields, body: stepBodySchema });
export const structuredGuideStepSchema = guideStepSchema.extend(structuredStepFields);
const documentFields = {
  title: z.string().trim().min(1).max(140),
  summary: z.string().trim().min(1).max(500),
  locale: z.string().regex(/^[a-z]{2}(?:-[A-Z]{2})?$/),
  difficulty: z.enum(['easy', 'moderate', 'advanced']),
  durationMinutes: z.number().int().min(1).max(10080),
  tools: z.array(z.string().trim().min(1).max(120)).max(50),
};
export const structuredGuideDocumentSchema = z.strictObject({
  ...documentFields,
  schemaVersion: z.literal(4),
  tools: z.array(z.string()).max(0),
  requirements: z.array(guideRequirementSchema).max(100),
  unresolvedTools: z
    .array(z.strictObject({ id: z.uuid(), label: z.string().min(1).max(120) }))
    .max(50),
  steps: z.array(structuredGuideStepSchema).min(1).max(100),
});
export const guideDocumentSchema = z
  .discriminatedUnion('schemaVersion', [
    z.strictObject({
      ...documentFields,
      schemaVersion: z.literal(1),
      steps: z.array(legacyGuideStepSchema).min(1).max(100),
    }),
    z.strictObject({
      ...documentFields,
      schemaVersion: z.literal(2),
      steps: z
        .array(z.strictObject({ ...stepFields, body: legacyFormattedBodySchema }))
        .min(1)
        .max(100),
    }),
    z.strictObject({
      ...documentFields,
      schemaVersion: z.literal(3),
      steps: z.array(guideStepSchema).min(1).max(100),
    }),
    structuredGuideDocumentSchema,
  ])
  .superRefine((document, context) => {
    const ids = new Set<string>();
    document.steps.forEach((step, index) => {
      if (ids.has(step.id))
        context.addIssue({
          code: 'custom',
          message: 'Each step needs a unique stable ID.',
          path: ['steps', index, 'id'],
        });
      ids.add(step.id);
    });
  });
export type GuideDocument = z.infer<typeof guideDocumentSchema>;
export type GuideDocumentV4 = z.infer<typeof structuredGuideDocumentSchema>;
export type GuideStep = z.infer<typeof guideStepSchema> &
  Partial<
    Pick<
      z.infer<typeof structuredGuideStepSchema>,
      'requirements' | 'preconditions' | 'earlierStepIds'
    >
  >;
export {
  guideRequirementSchema,
  stepRequirementUsageSchema,
  guidePreconditionSchema,
  requirementUnits,
  requirementUnitSchema,
  toStructuredDocument,
  getRequirementIssues,
  formatRequirementQuantity,
  allocatedRequirementQuantity,
} from './requirements';
export type {
  GuideRequirement,
  StepRequirementUsage,
  GuidePrecondition,
  RequirementUnit,
  RequirementIssue,
} from './requirements';

export type LegacyStepBody = z.infer<typeof legacyFormattedBodySchema>;
export type TextRun = z.infer<typeof textRunSchema>;
export { parseStepMarkdown, formatStepMarkdown } from './markdown';
export { hasInstructionText, normalizeStepBody } from './body';

export {
  bodyToEditorDocument,
  editorDocumentToBody,
  richDocumentSchema,
  isSafeRichTextHref,
} from './rich-text';
export type {
  RichDocument,
  RichNode,
  RichBlock,
  RichInline,
  RichMark,
  RichPanelTone,
  RichAlignment,
} from './rich-text';
