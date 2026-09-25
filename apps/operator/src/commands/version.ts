import { passdownVersion } from '@guide/contracts';
import type { OperatorCommand } from '../command';
export const versionCommand: OperatorCommand = {
  name: 'version',
  summary: 'Print the Passdown version and the source revision it was built from.',
  usage: 'version',
  needs: [],
  async run(_input, context) {
    context.out(
      `passdown ${passdownVersion} (revision ${context.revision?.slice(0, 12) ?? 'unknown'})`,
    );
  },
};
