import {
  describeSchemaDrift,
  describeSchemaState,
  readSchemaStateAsOwner,
  setupStateAsOwner,
} from '@guide/database';
import { OperatorFailure, type OperatorCommand } from '../command';
export const statusCommand: OperatorCommand = {
  name: 'status',
  summary: 'Report whether the database schema matches this version and whether setup is complete.',
  usage: 'status',
  needs: ['owner'],
  async run(_input, context) {
    const state = await readSchemaStateAsOwner(context.ownerURL!, context.policy);
    const problem = describeSchemaState(state, 'deployment');
    if (problem || !state.ok) throw new OperatorFailure(problem ?? 'The schema does not match.');
    const drift = describeSchemaDrift(state);
    if (drift) context.info(drift);
    context.out(`Database schema is current (${state.applied} migrations applied).`);
    context.out(`Setup: ${await setupStateAsOwner(context.ownerURL!, context.policy)}`);
  },
};
