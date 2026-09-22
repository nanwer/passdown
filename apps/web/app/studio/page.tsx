import { redirect } from 'next/navigation';
import { Workspaces } from '../../components/studio/pages';
import { currentActor, getApplication, isConfigured } from '../../lib/application';
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Your workspaces | Guide studio',
  robots: { index: false, follow: false },
};

export default async function Page() {
  // An installation serves one organisation and has one workspace, so this page
  // would usually ask somebody to choose from a list of one. Nobody lands on a
  // picker in any comparable product; they land in the thing itself. With
  // several — which the development seed has — the list is still worth showing.
  if (isConfigured()) {
    const actor = await currentActor();
    if (actor.kind === 'user') {
      const workspaces = await getApplication().store.listWorkspaces(actor);
      if (workspaces.length === 1) redirect(`/studio/${workspaces[0]!.id}`);
    }
  }
  return <Workspaces />;
}
