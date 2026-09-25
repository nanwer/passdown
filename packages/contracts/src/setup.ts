import { z } from 'zod';
/**
 * The published first login of a new installation. It can only be used to
 * finish setting up, which replaces it.
 */
export const defaultLogin = { email: 'admin@example.com', password: 'changeme' } as const;
/** Finish setting up: the default login becomes the installation's first administrator. */
export const finishSetupSchema = z.strictObject({
  name: z.string().trim().min(1, 'Enter your name.').max(120, 'Use 120 characters or fewer.'),
  email: z
    .email('Enter a valid email address.')
    .max(200, 'Use 200 characters or fewer.')
    .refine(
      (email) => email.trim().toLowerCase() !== defaultLogin.email,
      `Use your own email address, not ${defaultLogin.email}.`,
    ),
  password: z
    .string()
    .min(12, 'Use at least 12 characters.')
    .max(200, 'Use 200 characters or fewer.'),
  workspaceName: z
    .string()
    .trim()
    .min(1, 'Enter a name for your workspace.')
    .max(80, 'Use 80 characters or fewer.'),
});
export type FinishSetupInput = z.infer<typeof finishSetupSchema>;
