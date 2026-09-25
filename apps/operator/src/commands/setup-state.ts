import { setupStateAsOwner } from '@guide/database';
import type { OperatorCommand } from '../command';
export const setupStateCommand: OperatorCommand = {
  name: 'setup-state',
  summary:
    'Report the first-run state: default-login (waiting to finish setting up), no-account or complete.',
  usage: 'setup-state',
  needs: ['owner'],
  async run(_input, context) {
    context.out(await setupStateAsOwner(context.ownerURL!, context.policy));
  },
};
