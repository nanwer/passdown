import { z } from 'zod';
export const setupSchema = z.strictObject({
  code: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  email: z.email().max(200),
  password: z.string().min(12).max(200),
  workspaceName: z.string().trim().min(1).max(80),
});
export type SetupInput = z.infer<typeof setupSchema>;
