import { ensureRuntimeRole, RuntimeRoleError } from '@guide/database';
import { OperatorFailure, type OperatorCommand } from '../command';
export const runtimePasswordCommand: OperatorCommand = {
  name: 'runtime-password',
  summary: 'Give the runtime database role the password in GUIDE_DATABASE_URL and prove it.',
  usage: 'runtime-password',
  needs: ['owner', 'runtime'],
  async run(_input, context) {
    try {
      await ensureRuntimeRole({
        ownerURL: context.ownerURL!,
        runtimeURL: context.runtimeURL!,
        policy: context.policy,
        setPassword: true,
        phase: 'after-schema',
      });
    } catch (error) {
      if (error instanceof RuntimeRoleError) throw new OperatorFailure(error.message, 4);
      throw error;
    }
    context.out(
      'guide_runtime now uses the password in GUIDE_DATABASE_URL. Recreate web: docker compose up -d --force-recreate web',
    );
  },
};
