import { z } from 'zod';
import type { Category, CategoryCounts, CatalogItem, CatalogUsageCounts } from './index';

const managementFields = {
  page: z.coerce.number().int().min(1).max(1000000).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(25),
  search: z.string().trim().max(200).default(''),
  status: z.enum(['all', 'active', 'inactive']).default('active'),
  visibility: z.enum(['all', 'public', 'members']).default('all'),
  usage: z.enum(['all', 'used', 'unused']).default('all'),
  direction: z.enum(['ascending', 'descending']).default('ascending'),
  reveal: z.uuid().optional(),
};
const identifiers = z.preprocess(
  (value) => (typeof value === 'string' ? (value ? value.split(',') : []) : value),
  z.array(z.uuid()).max(500).default([]),
);
export const categoryManagementQuerySchema = z.object({
  ...managementFields,
  domain: z.literal('guide').default('guide'),
  sort: z
    .enum(['tree', 'name', 'code', 'guides', 'published', 'visibility', 'status'])
    .default('tree'),
  expanded: identifiers,
  collapsed: identifiers,
});
export const catalogManagementQuerySchema = z.object({
  ...managementFields,
  sort: z
    .enum([
      'name',
      'specification',
      'partNumber',
      'manufacturer',
      'model',
      'unit',
      'visibility',
      'guides',
      'status',
    ])
    .default('name'),
});
export type CategoryManagementQuery = z.infer<typeof categoryManagementQuerySchema>;
export type CatalogManagementQuery = z.infer<typeof catalogManagementQuerySchema>;
export type ManagementStatusCounts = { all: number; active: number; inactive: number };
export type CategoryManagementRow = {
  category: Category;
  depth: number;
  /** An ancestor included for context rather than as a matching result on this page. */
  context: boolean;
  hasChildren: boolean;
  expanded: boolean;
};
export type CategoryManagementPage = {
  /** Bounded to the page and its boundary ancestors; this is not the complete tree. */
  categories: Category[];
  counts: CategoryCounts[];
  rows: CategoryManagementRow[];
  /** Visible tree rows after expansion, including filter ancestors; boundary ancestors do not add to this total. */
  total: number;
  page: number;
  pageSize: number;
  statusCounts: ManagementStatusCounts;
};
export type CatalogManagementPage = {
  items: CatalogItem[];
  usage: CatalogUsageCounts[];
  total: number;
  page: number;
  pageSize: number;
  statusCounts: ManagementStatusCounts;
};
