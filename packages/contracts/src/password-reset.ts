import { z } from 'zod';
export const newPasswordSchema = z.string().min(12, 'At least twelve characters.').max(200);
export const redeemPasswordResetSchema = z.strictObject({ password: newPasswordSchema });
export const adminAccountQuerySchema = z.strictObject({
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});
export type PasswordResetPreview = {
  email: string;
  name: string;
  expiresAt: string;
  signedInAs: string | null;
};
export type IssuedPasswordReset = { link: string; expiresAt: string };
export type AdminAccount = {
  id: string;
  name: string;
  email: string;
  status: 'active' | 'suspended' | 'unconfirmed';
  mustChangePassword: boolean;
  isAdministrator: boolean;
  isYou: boolean;
  workspaces: { id: string; name: string; role: 'manage' | 'view' }[];
  pendingReset: { expiresAt: string; issuedVia: 'operator' | 'administrator' } | null;
};
