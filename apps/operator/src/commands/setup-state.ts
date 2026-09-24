import { setupStateAsOwner } from '@guide/database';
import type { OperatorCommand } from '../command';
export const setupStateCommand: OperatorCommand = {
  name: 'setup-state',
  summary: 'Report whether first-run setup is required or complete.',
  usage: 'setup-state',
  needs: ['owner'],
  async run(_input, context) {
    context.out(await setupStateAsOwner(context.ownerURL!, context.policy));
  },
};
