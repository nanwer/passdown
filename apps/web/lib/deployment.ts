import {
  authSecret,
  ConfigurationError,
  describeDatabaseTarget,
  identityOrigin,
  runtimeDatabaseTarget,
  type ConnectionPolicy,
} from '@guide/database';
type Environment = Record<string, string | undefined>;
export type DeploymentStatus = {
  production: boolean;
  policy: ConnectionPolicy;
  configured: boolean;
  problems: { variable: string; message: string }[];
  previewIgnored: boolean;
  origin?: string;
  database?: string;
  setupCodeHash?: Buffer;
};
export function readDeploymentStatus(
  env: Environment,
  nodeEnv: string | undefined,
): DeploymentStatus {
  const production = nodeEnv === 'production';
  const policy = production ? 'deployment' : 'loopback';
  const status: DeploymentStatus = {
    production,
    policy,
    configured: false,
    problems: [],
    previewIgnored: production && env.GUIDE_DEMO_PREVIEW === '1',
  };
  const check = (run: () => void) => {
    try {
      run();
    } catch (error) {
      if (!(error instanceof ConfigurationError)) throw error;
      status.problems.push({ variable: error.variable, message: error.message });
    }
  };
  check(() => {
    status.database = describeDatabaseTarget(runtimeDatabaseTarget(env.GUIDE_DATABASE_URL, policy));
  });
  check(() => {
    authSecret(env.BETTER_AUTH_SECRET);
  });
  check(() => {
    status.origin = identityOrigin(env.BETTER_AUTH_URL, policy);
  });
  status.configured = status.problems.length === 0;
  status.setupCodeHash = /^[a-f0-9]{64}$/i.test(env.PASSDOWN_SETUP_CODE_SHA256 ?? '')
    ? Buffer.from(env.PASSDOWN_SETUP_CODE_SHA256!, 'hex')
    : undefined;
  return status;
}
let cached: DeploymentStatus | undefined;
export function deploymentStatus() {
  return (cached ??= readDeploymentStatus(process.env, process.env.NODE_ENV));
}
export function sampleLibraryEnabled(
  env: Environment = process.env,
  nodeEnv = process.env.NODE_ENV,
) {
  return nodeEnv !== 'production' && !env.GUIDE_DATABASE_URL;
}
export function previewIdentitiesEnabled(
  env: Environment = process.env,
  nodeEnv = process.env.NODE_ENV,
) {
  return nodeEnv !== 'production' && env.GUIDE_DEMO_PREVIEW === '1';
}
export function configurationHint(production = process.env.NODE_ENV === 'production') {
  return production
    ? 'This installation is not configured yet. Ask the operator to check its settings.'
    : 'Local authoring is not configured yet. Run pnpm local:setup, then restart the app.';
}
