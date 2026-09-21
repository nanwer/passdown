import { z } from 'zod';
import { guideDocumentSchema, type GuideDocument } from '@guide/content';

export const contentLicenseSchema = z.enum(['all-rights-reserved', 'CC-BY-4.0', 'CC-BY-SA-4.0']);
export type ContentLicense = z.infer<typeof contentLicenseSchema>;
/**
 * What kind of work a guide is, and the answer to the question that type asks.
 *
 * Null when the workspace has no types switched on, or the author skipped it —
 * a guide written before this existed is not broken, it just has no type. The
 * key shape is restated here rather than imported from the catalog because the
 * API must reject a malformed key before anything looks it up.
 */
export const guideTypeSelectionSchema = z
  .strictObject({
    key: z
      .string()
      .min(1)
      .max(40)
      .regex(/^[a-z][a-z0-9-]*$/, 'A guide type key is lower case letters, digits and hyphens.'),
    subject: z.string().trim().max(140),
  })
  .nullable();
export type GuideTypeSelection = z.infer<typeof guideTypeSelectionSchema>;

export const createDraftSchema = z.strictObject({
  document: guideDocumentSchema,
  categoryId: z.uuid(),
  audience: z.enum(['public', 'members']),
  guideType: guideTypeSelectionSchema.optional(),
});
export const saveDraftSchema = z.strictObject({
  expectedVersion: z.number().int().min(1),
  document: guideDocumentSchema,
  categoryId: z.uuid(),
  guideType: guideTypeSelectionSchema.optional(),
});
export const publishSchema = z.strictObject({
  expectedVersion: z.number().int().min(1),
  expectedRelease: z.number().int().min(1).nullable(),
  license: contentLicenseSchema,
});
export type CreateDraftInput = z.infer<typeof createDraftSchema>;
export type SaveDraftInput = z.infer<typeof saveDraftSchema>;
export type PublishInput = z.infer<typeof publishSchema>;

export type StudioWorkspace = {
  id: string;
  name: string;
  audience: 'public' | 'private';
  role: 'owner' | 'reader' | 'author' | 'admin' | 'contributor';
};
export type DraftSummary = {
  id: string;
  workspaceId: string;
  title: string;
  summary: string;
  category: string;
  categoryId: string;
  categoryPath: CategoryPath;
  audience: 'public' | 'members';
  version: number;
  currentRelease: number | null;
  publishedVersion: number | null;
  updatedAt: string;
  stepCount: number;
  guideType: GuideTypeSelection;
};
export type DraftGuide = DraftSummary & { document: GuideDocument };
export type PublishedGuide = {
  id: string;
  workspaceId: string;
  title: string;
  summary: string;
  category: string;
  categoryId: string;
  categoryPath: CategoryPath;
  audience: 'public' | 'members';
  state: 'published';
  document: GuideDocument;
  artwork: 'bicycle' | 'lamp' | 'keyboard' | 'headphones' | 'bench' | 'camera';
  author: string;
  updatedAt: string;
  release: number;
  isSample: boolean;
  license: ContentLicense | 'local-preview-only';
};
/**
 * How many published guides one library request returns.
 *
 * A listing has to be bounded somewhere, and the bound belongs with the
 * contract rather than in each caller: the reader page, the category page and
 * the public API all describe the same collection and should agree about how
 * much of it a single response carries.
 */
export const libraryPageSize = 24;
/** The largest page a caller may ask for, so a parameter cannot undo the bound. */
export const maxLibraryPageSize = 100;
/** One screenful of previously uploaded pictures, for choosing among them. */
export const assetPageSize = 24;
export type WorkspaceAsset = {
  id: string;
  width: number;
  height: number;
  byteSize: number;
  createdAt: string;
};
/**
 * One page of a published listing, with the size of the whole match beside it.
 *
 * `total` is what matched, not what is in `guides`. Returning both is what lets
 * an interface say "24 of 176" instead of ending at 24 and looking complete.
 */
export type PublishedGuidePage = {
  guides: PublishedGuide[];
  total: number;
  limit: number;
  offset: number;
};
export type StudioSession = {
  user: { id: string; name: string; email: string };
  workspaces: StudioWorkspace[];
};
export type ValidationIssue = { path: string; message: string };
export class ApplicationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly issues?: ValidationIssue[],
  ) {
    super(message);
    this.name = 'ApplicationError';
  }
}

export const categoryDomainSchema = z.enum(['guide', 'tool', 'material']);
export type CategoryDomain = z.infer<typeof categoryDomainSchema>;
export const catalogKindSchema = z.enum(['tool', 'material', 'part']);
export type CatalogKind = z.infer<typeof catalogKindSchema>;
export const catalogUnitSchema = z.enum(['each', 'pair', 'g', 'kg', 'ml', 'l', 'mm', 'cm', 'm']);
export type CatalogUnit = z.infer<typeof catalogUnitSchema>;
export type CategoryPath = { id: string; name: string }[];
export const categoryFields = {
  domain: categoryDomainSchema,
  parentId: z.uuid().nullable(),
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).default(''),
  visibility: z.enum(['public', 'members']),
  sortOrder: z.number().int().min(0).max(100000).default(0),
};
/**
 * Short business identifier, unique per workspace and domain. The server
 * proposes one at creation and it can be changed only then: renaming or moving
 * a category never changes its code, so existing references stay meaningful.
 */
export const categoryCodeSchema = z
  .string()
  .trim()
  .min(1)
  .max(24)
  .regex(/^[A-Za-z0-9][A-Za-z0-9-]*$/, 'Use letters, numbers and hyphens.')
  .transform((value) => value.toUpperCase());
export const createCategorySchema = z.strictObject({
  ...categoryFields,
  code: categoryCodeSchema.optional(),
});
export const updateCategorySchema = z.strictObject({
  ...categoryFields,
  expectedVersion: z.number().int().min(1),
  archived: z.boolean().default(false),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type Category = Omit<CreateCategoryInput, 'code'> & {
  id: string;
  workspaceId: string;
  code: string;
  archived: boolean;
  version: number;
  path: CategoryPath;
  /**
   * The picture shown for this thing, or null. Carried on the listing rather
   * than fetched per row so a gallery renders in one request — which is what
   * makes a picture grid affordable as the default way to browse.
   */
  imageAssetId: string | null;
};
/**
 * Distinct guides assigned to a category. `direct` counts guides whose own
 * category is this one; `subtree` adds every authorized descendant. Each
 * logical guide counts once — never its steps, requirements or release
 * versions. The published figures describe guides whose current release sits
 * here, which is what blocks deactivation.
 */
export type CategoryCounts = {
  categoryId: string;
  direct: number;
  subtree: number;
  publishedDirect: number;
  publishedSubtree: number;
};
/**
 * What currently prevents a category being deactivated. Superseded releases are
 * deliberately absent: they keep their own frozen category reference, so they
 * are history rather than a current assignment.
 */
export type CategoryBlockers = {
  activeChildren: number;
  assignedGuides: number;
  currentReleases: number;
  activeItems: number;
};
export const catalogFields = {
  name: z.string().trim().min(1).max(160),
  specification: z.string().trim().max(500).default(''),
  description: z.string().trim().max(2000).default(''),
  manufacturer: z.string().trim().max(160).default(''),
  model: z.string().trim().max(160).default(''),
  partNumber: z.string().trim().max(160).default(''),
  defaultUnit: catalogUnitSchema,
  visibility: z.enum(['public', 'members']),
};
export const createCatalogItemSchema = z.strictObject(catalogFields);
export const updateCatalogItemSchema = z.strictObject({
  ...catalogFields,
  expectedVersion: z.number().int().min(1),
  archived: z.boolean().default(false),
});
export type CreateCatalogItemInput = z.infer<typeof createCatalogItemSchema>;
export type UpdateCatalogItemInput = z.infer<typeof updateCatalogItemSchema>;
export type CatalogItem = CreateCatalogItemInput & {
  id: string;
  workspaceId: string;
  archived: boolean;
  version: number;
};
/**
 * How many distinct guides use a catalog item. Drafts and current releases are
 * separate because moving an item out of a draft does not change what a
 * published release already froze.
 */
export type CatalogUsageCounts = {
  itemId: string;
  draftGuides: number;
  publishedGuides: number;
};
/**
 * A guide's place in its family: the path up to the broadest guide, and the
 * narrower guides directly beneath it. Only what the reader may open appears,
 * so an unreadable relative leaves no trace rather than a locked placeholder.
 */
export const guideFamilySchema = z.strictObject({
  /** null removes the guide from its family, leaving it standalone. */
  parentGuideId: z.uuid().nullable(),
  sortOrder: z.number().int().min(0).max(100000).default(0),
});
export type GuideFamilyInput = z.infer<typeof guideFamilySchema>;
export const guideAudienceSchema = z.strictObject({
  audience: z.enum(['public', 'members']),
  /**
   * The release the author was looking at when they decided. A mismatch means
   * someone published in between, so the move is refused rather than making a
   * version public that nobody has read.
   */
  expectedRelease: z.number().int().min(1).nullable(),
});
export type GuideAudienceInput = z.infer<typeof guideAudienceSchema>;
export type GuidePublicBlocker = { kind: 'workspace' | 'category' | 'item'; name: string };
export type GuideFamily = {
  ancestors: { id: string; title: string }[];
  children: { id: string; title: string }[];
};
export type CatalogUsage = {
  guides: {
    id: string;
    title: string;
    audience: 'public' | 'members';
    currentRelease: number | null;
  }[];
};
