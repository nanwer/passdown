import { z } from 'zod';

/**
 * What kind of work a guide describes.
 *
 * The thing tree answers "what is this about". It kept being asked to answer
 * "what kind of work is this" as well, because nothing else could: in the
 * workshop workspace, four guides out of five were filed under Inspection,
 * Verification or Workshop routines — none of which is a thing anyone owns.
 * A tree that means two different things in different rows stops being
 * browsable, which is the same fault migration 015 fixed from the other side.
 *
 * So the kind of work becomes its own axis. It also carries a title template,
 * because the other half of the problem is a create form that opens with an
 * empty title box and no help: the fortieth changeover procedure should not be
 * named by whoever happened to write it.
 *
 * The defaults ship, and stay editable. Passdown is software somebody deploys
 * themselves, so the operator and the vendor are the same person: a set they
 * cannot change without a fork is a set they cannot use.
 *
 * The placeholders match this project's own vocabulary — %thing is the thing
 * from the tree, %subject is the answer to the prompt.
 */
export const guideTypeSchema = z.strictObject({
  /**
   * The referent. URLs, search, exports and the API bind to this and never to
   * the label, which is presentational and may be rewritten at any time.
   *
   * This is the one point every product surveyed agrees on, and the one that is
   * painful to retrofit: Jira bound saved filters to issue-type names and has
   * had an open bug since 2010 where renaming a type silently breaks them.
   */
  key: z
    .string()
    .min(1)
    .max(40)
    .regex(/^[a-z][a-z0-9-]*$/, 'A key is lower case letters, digits and hyphens.'),
  label: z.string().trim().min(1).max(60),
  /** Helper text under the label, so the picker explains itself. */
  description: z.string().trim().max(200),
  /**
   * The type's own question, asked once at creation. Empty when the type needs
   * nothing beyond the thing — a teardown is a teardown of the whole thing.
   */
  prompt: z.string().trim().max(120),
  /**
   * %thing is replaced by the thing's name, %subject by the answer to the
   * prompt. A template that uses %subject while the prompt is empty would
   * compose a title with a hole in it, so that combination is rejected.
   */
  titleTemplate: z.string().trim().min(1).max(200),
});
export type GuideType = z.infer<typeof guideTypeSchema>;

export const guideTypeCatalogSchema = z
  .array(guideTypeSchema)
  .max(50)
  .refine(
    (types) => new Set(types.map((t) => t.key)).size === types.length,
    'Two types share a key; a key identifies one kind of work.',
  )
  .refine(
    (types) => types.every((t) => t.prompt !== '' || !t.titleTemplate.includes('%subject')),
    'A template uses %subject but its type asks no question, so the title would have a hole in it.',
  );

/**
 * The set an installation starts with. Edit this to change what a fresh
 * workspace is offered; existing workspaces keep whatever they were given,
 * because their guides already refer to those keys.
 *
 * Deliberately broad enough to cover both audiences this platform serves at
 * once — a repair collective switches on Repair, Replacement and Teardown, a
 * workshop switches on Inspection, Maintenance and Repair — rather than
 * shipping two lists and asking which kind of company you are.
 */
export const defaultGuideTypes: GuideType[] = [
  {
    key: 'repair',
    label: 'Repair',
    description: 'Putting something right that has stopped working.',
    prompt: 'What are you repairing?',
    titleTemplate: '%thing %subject Repair',
  },
  {
    key: 'replacement',
    label: 'Replacement',
    description: 'Swapping one part out for another.',
    prompt: 'What part are you replacing?',
    titleTemplate: '%thing %subject Replacement',
  },
  {
    key: 'disassembly',
    label: 'Disassembly',
    description: 'Taking something apart, as a step towards something else.',
    prompt: 'What are you taking apart?',
    titleTemplate: 'Disassembling %thing %subject',
  },
  {
    key: 'teardown',
    label: 'Teardown',
    description: 'Taking something apart to show what is inside it.',
    prompt: '',
    titleTemplate: '%thing Teardown',
  },
  {
    key: 'inspection',
    label: 'Inspection',
    description: 'Checking something against a standard, and recording what you found.',
    prompt: 'What are you checking?',
    titleTemplate: '%thing %subject Inspection',
  },
  {
    key: 'maintenance',
    label: 'Maintenance',
    description: 'Work done on a schedule to stop something failing.',
    prompt: '',
    titleTemplate: '%thing Maintenance',
  },
  {
    key: 'how-to',
    label: 'How-to',
    description: 'Anything else worth writing down.',
    prompt: 'What will the reader do?',
    titleTemplate: 'How to %subject',
  },
];

/**
 * Fill a type's template in.
 *
 * The result is a suggestion, never a constraint — the author owns the title
 * box and this only offers a starting point. So a missing answer collapses its
 * placeholder rather than refusing: someone who has chosen a thing but not yet
 * answered the prompt should watch the title assemble itself, not see an error.
 */
export function composeGuideTitle(
  type: Pick<GuideType, 'titleTemplate'>,
  values: { thing: string; subject?: string },
): string {
  const filled = type.titleTemplate
    .replaceAll('%thing', values.thing.trim())
    .replaceAll('%subject', (values.subject ?? '').trim());
  // Collapsing a placeholder leaves the spaces that surrounded it behind, and
  // "How to" with nothing after it is a title nobody wrote on purpose.
  return filled.replace(/\s+/g, ' ').trim();
}

/** The enabled types of a workspace, in catalog order, ignoring unknown keys. */
export function enabledGuideTypes(catalog: GuideType[], enabled: readonly string[]): GuideType[] {
  const wanted = new Set(enabled);
  return catalog.filter((type) => wanted.has(type.key));
}
