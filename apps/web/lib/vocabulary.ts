/**
 * What this installation calls the things guides are about.
 *
 * The tree was called a "category" until now, and the word never said a
 * category *of what*. A category tree that holds Bicycles, Electronics and
 * Home & living is a tree of things; one that holds Line 3 and the packing
 * hall is still a tree of things. "Category" describes the container and never
 * the contents, which is why the create dialog read as a form with no subject.
 *
 * iFixit calls the same object a Device and has visibly outgrown it — their
 * picker is headed "Select a device" over a list beginning with Apparel, and
 * their own create form defines one as "any thing that warrants a repair
 * manual". Dozuki, built on the same code for workplaces, renamed it to
 * Category and defines it as "like folders that your documentation gets
 * organized into". Neither word survived contact with a second audience.
 *
 * So the words live here rather than in forty components. Today they are
 * constants. When a workspace can choose its own — a factory saying Equipment,
 * a restaurant saying Dishes — this becomes a lookup and the call sites do not
 * change. That is the whole reason for the indirection; without it the same
 * rename happens twice.
 */
export const words = {
  /** Lower case, singular. "Add a thing", "part of a broader thing". */
  thing: 'thing',
  /** Lower case, plural. "Browse things". */
  things: 'things',
  /** Capitalised, singular. Starts a sentence or labels a field. */
  Thing: 'Thing',
  /** Capitalised, plural. Navigation and page titles. */
  Things: 'Things',
} as const;

export type Words = typeof words;
