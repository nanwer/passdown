import { hashPassword, verifyPassword } from 'better-auth/crypto';
/** Keep the adapter aligned with Better Auth's email/password sign-in. */
export const hashCredentialPassword = (password: string): Promise<string> => hashPassword(password);
export const verifyCredentialPassword = (input: {
  password: string;
  hash: string;
}): Promise<boolean> => verifyPassword(input);
export const canonicalAccountEmail = (email: string): string => email.toLowerCase();
