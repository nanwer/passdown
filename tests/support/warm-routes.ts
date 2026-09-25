import type { FullConfig } from '@playwright/test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDirectory = fileURLToPath(new URL('../../apps/web/app/', import.meta.url));

/**
 * One address for every page and route handler in the application, with a
 * placeholder in each dynamic segment. The development server compiles a route
 * whatever the parameter turns out to name, so a placeholder that answers 404
 * compiles it as well as a real record would.
 *
 * Read from the app directory rather than listed, so a route added tomorrow is
 * warmed without anybody remembering to add it here.
 */
export function applicationRoutes(directory = appDirectory, segments: string[] = []) {
  const routes: { path: string; kind: 'page' | 'handler' }[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const name = entry.name;
      // Private folders and parallel slots are not part of the address; groups
      // contribute their children but no segment of their own.
      if (name.startsWith('_') || name.startsWith('@')) continue;
      const segment = /^\(.*\)$/.test(name)
        ? []
        : name.startsWith('[[...')
          ? []
          : name.startsWith('[')
            ? ['warm-up']
            : [name];
      routes.push(...applicationRoutes(join(directory, name), [...segments, ...segment]));
    } else if (/^page\.(tsx|ts|jsx|js)$/.test(entry.name)) {
      routes.push({ path: `/${segments.join('/')}`, kind: 'page' });
    } else if (/^route\.(tsx|ts|jsx|js)$/.test(entry.name)) {
      routes.push({ path: `/${segments.join('/')}`, kind: 'handler' });
    }
  }
  return routes;
}

/**
 * Compile every route before the first test runs.
 *
 * The browser suites run `next dev`, which compiles a route the first time
 * anything asks for it. On a hosted runner that first compile of a category
 * page took longer than the five seconds an assertion waits, so whichever test
 * happened to reach a route first was measuring the compiler: a category chip
 * that had been pressed still showed the previous results, a thing's page was
 * still at the front page's address, and a category create took over five
 * seconds. Locally, on a throttled machine, the first client transition to a
 * category page took 3.3 s and every later one about 0.1 s.
 *
 * Pages are fetched as documents, which compiles their server and client code.
 * Route handlers are asked OPTIONS, which loads the module to learn its methods
 * without running any handler: no rate limit is spent and nothing is logged as
 * a failed request.
 */
export default async function warmRoutes(config: FullConfig) {
  const baseURL = config.projects[0]?.use.baseURL;
  if (!baseURL) throw new Error('Route warm-up needs a baseURL.');
  const started = Date.now();
  const queue = applicationRoutes();
  const total = queue.length;
  // The compiler works on several routes at once; a few requests in flight
  // keep it busy without asking for everything at the same moment.
  const worker = async () => {
    for (let route = queue.shift(); route; route = queue.shift()) {
      const response = await fetch(new URL(route.path, baseURL), {
        method: route.kind === 'page' ? 'GET' : 'OPTIONS',
        headers: route.kind === 'page' ? { accept: 'text/html' } : {},
        redirect: 'manual',
      });
      await response.arrayBuffer();
      // A compile error must stop the run here, named, rather than as a
      // confusing failure in whichever test reaches the route first.
      if (response.status >= 500 && response.status !== 503)
        throw new Error(`Warming ${route.path} answered ${response.status}.`);
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  console.log(`Warmed ${total} routes in ${Date.now() - started} ms.`);
}
