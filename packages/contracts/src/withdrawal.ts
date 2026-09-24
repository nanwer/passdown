import { z } from 'zod';
export const guideStateSchema = z.enum(['draft', 'published', 'withdrawn']);
export type GuideState = z.infer<typeof guideStateSchema>;
const publicationRevision = z.number().int().min(0);
export const withdrawGuideSchema = z.strictObject({
  expectedRelease: z.number().int().min(1),
  expectedPublicationRevision: publicationRevision,
  reason: z.string().trim().max(500).optional(),
});
export const reinstateGuideSchema = z.strictObject({
  expectedRelease: z.number().int().min(1),
  expectedPublicationRevision: publicationRevision,
});
export type WithdrawGuideInput = z.infer<typeof withdrawGuideSchema>;
export type ReinstateGuideInput = z.infer<typeof reinstateGuideSchema>;
export type GuideReinstateBlocker = {
  kind: 'workspace' | 'category' | 'item';
  name: string;
  reason: 'inactive' | 'members-only' | 'private-workspace';
};
