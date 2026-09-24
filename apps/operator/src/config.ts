import {
  ConfigurationError,
  identityOrigin,
  ownerDatabaseTarget,
  runtimeDatabaseTarget,
} from '@guide/database';
import { isAbsolute } from 'node:path';
import type { OperatorContext, OperatorNeed } from './command';
export function readOperatorConfig(
  needs: readonly OperatorNeed[],
  env: Record<string, string | undefined>,
): Pick<OperatorContext, 'policy' | 'ownerURL' | 'runtimeURL' | 'origin' | 'mediaRoot'> {
  const policy = env.NODE_ENV === 'production' ? 'deployment' : 'loopback';
  const result: ReturnType<typeof readOperatorConfig> = { policy };
  if (needs.includes('owner')) {
    ownerDatabaseTarget(env.GUIDE_OWNER_DATABASE_URL, policy);
    result.ownerURL = env.GUIDE_OWNER_DATABASE_URL;
  }
  if (needs.includes('runtime')) {
    runtimeDatabaseTarget(env.GUIDE_DATABASE_URL, policy);
    result.runtimeURL = env.GUIDE_DATABASE_URL;
  }
  if (needs.includes('origin')) result.origin = identityOrigin(env.BETTER_AUTH_URL, policy);
  if (needs.includes('media')) {
    if (!env.GUIDE_MEDIA_ROOT || !isAbsolute(env.GUIDE_MEDIA_ROOT))
      throw new ConfigurationError('GUIDE_MEDIA_ROOT', 'must be an absolute directory path.');
    result.mediaRoot = env.GUIDE_MEDIA_ROOT;
  }
  return result;
}
