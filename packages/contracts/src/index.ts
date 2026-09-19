import { z } from 'zod';
import { guideDocumentSchema, type GuideDocument } from '@guide/content';

export const contentLicenseSchema = z.enum(['all-rights-reserved', 'CC-BY-4.0', 'CC-BY-SA-4.0']);
export type ContentLicense = z.infer<typeof contentLicenseSchema>;
export const createDraftSchema = z.strictObject({
  document: guideDocumentSchema,
  categoryId: z.uuid(),
  audience: z.enum(['public', 'members']),
});
export const saveDraftSchema = z.strictObject({
  expectedVersion: z.number().int().min(1),
  document: guideDocumentSchema,
  categoryId: z.uuid(),
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
export const createCategorySchema = z.strictObject(categoryFields);
export const updateCategorySchema = z.strictObject({
  ...categoryFields,
  expectedVersion: z.number().int().min(1),
  archived: z.boolean().default(false),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type Category = CreateCategoryInput & {
  id: string;
  workspaceId: string;
  archived: boolean;
  version: number;
  path: CategoryPath;
};
export const catalogFields = {
  categoryId: z.uuid(),
  kind: catalogKindSchema,
  name: z.string().trim().min(1).max(160),
  specification: z.string().trim().max(500).default(''),
  description: z.string().trim().max(2000).default(''),
  manufacturer: z.string().trim().max(160).default(''),
  model: z.string().trim().max(160).default(''),
  partNumber: z.string().trim().max(160).default(''),
  defaultUnit: catalogUnitSchema,
  visibility: z.enum(['public', 'members']),
};
export const createCatalogItemSchema = z.strictObject(catalogFields).superRefine((item, ctx) => {
  if (item.kind === 'tool' && !['each', 'pair'].includes(item.defaultUnit))
    ctx.addIssue({
      code: 'custom',
      path: ['defaultUnit'],
      message: 'Tools use each or pair units.',
    });
});
export const updateCatalogItemSchema = z
  .strictObject({
    ...catalogFields,
    expectedVersion: z.number().int().min(1),
    archived: z.boolean().default(false),
  })
  .superRefine((item, ctx) => {
    if (item.kind === 'tool' && !['each', 'pair'].includes(item.defaultUnit))
      ctx.addIssue({
        code: 'custom',
        path: ['defaultUnit'],
        message: 'Tools use each or pair units.',
      });
  });
export type CreateCatalogItemInput = z.infer<typeof createCatalogItemSchema>;
export type UpdateCatalogItemInput = z.infer<typeof updateCatalogItemSchema>;
export type CatalogItem = CreateCatalogItemInput & {
  id: string;
  workspaceId: string;
  archived: boolean;
  version: number;
  categoryPath: CategoryPath;
};
export type CatalogUsage = {
  guides: {
    id: string;
    title: string;
    audience: 'public' | 'members';
    currentRelease: number | null;
  }[];
};
