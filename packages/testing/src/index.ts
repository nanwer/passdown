import { guideDocumentSchema, type GuideDocument } from '@guide/content';
import {
  createGuideQueries,
  type GuideIndexRecord,
  type Membership,
  type Workspace,
} from '@guide/core';
export type Artwork = 'bicycle' | 'lamp' | 'keyboard' | 'headphones' | 'bench' | 'camera';
export type DemoGuide = GuideIndexRecord & {
  document: GuideDocument;
  artwork: Artwork;
  author: string;
  updatedAt: string;
  release: number;
};
const workspaces: Workspace[] = [
  { id: 'repair-collective', name: 'Repair collective', audience: 'public' },
  { id: 'workshop', name: 'Workshop operations', audience: 'private' },
];
const memberships: Membership[] = [
  { actorId: 'demo-reader', workspaceId: 'workshop', role: 'view', active: true },
];
const paragraph = (text: string) => ({
  type: 'paragraph' as const,
  children: [{ type: 'text' as const, text, marks: [] }],
});
function document(
  title: string,
  summary: string,
  durationMinutes: number,
  difficulty: 'easy' | 'moderate',
  subject: string,
): GuideDocument {
  return guideDocumentSchema.parse({
    schemaVersion: 1,
    title,
    summary,
    locale: 'en',
    difficulty,
    durationMinutes,
    tools: ['Soft work mat', 'A small parts tray', 'The manufacturer’s instructions'],
    steps: [
      {
        id: '10000000-0000-4000-8000-000000000001',
        title: 'Make room to work',
        body: [
          paragraph(
            `Set ${subject} on a clear, well-lit surface. Leave enough space to arrange parts in the order you remove them.`,
          ),
        ],
        media: [],
        callouts: [
          {
            tone: 'info',
            title: 'An example, for exploration',
            body: 'This is original sample content for the guide reader. Follow a verified procedure for your exact equipment before carrying out a repair.',
          },
        ],
      },
      {
        id: '10000000-0000-4000-8000-000000000002',
        title: 'Get to know the assembly',
        body: [
          paragraph(
            'Find the model identifier and compare the assembly with the manufacturer’s documentation. Note fastener locations before making any changes.',
          ),
          {
            type: 'bulletList',
            items: [
              'Identify the parts you will handle.',
              'Check the tools required for the exact model.',
              'Keep a record of the original arrangement.',
            ],
          },
        ],
        media: [],
        callouts: [],
      },
      {
        id: '10000000-0000-4000-8000-000000000003',
        title: 'Inspect the contact points',
        body: [
          paragraph(
            'Look for wear, dirt or a loose connection. In this sample, the illustration marks the inspection area; a production guide would include model-specific photographs and instructions.',
          ),
        ],
        media: [],
        callouts: [
          {
            tone: 'warning',
            title: 'Stop if something does not match',
            body: 'Do not force a part or improvise around damaged equipment. Check a suitable verified procedure.',
          },
        ],
      },
      {
        id: '10000000-0000-4000-8000-000000000004',
        title: 'Check the arrangement',
        body: [
          paragraph(
            'Compare the finished arrangement with your starting reference and the equipment’s documented requirements. Account for every removed part before returning the equipment to use.',
          ),
        ],
        media: [],
        callouts: [],
      },
      {
        id: '10000000-0000-4000-8000-000000000005',
        title: 'Leave a useful record',
        body: [
          paragraph(
            'Record what you observed and any questions for the next person. Clear, specific notes make knowledge easier to pass on.',
          ),
        ],
        media: [],
        callouts: [],
      },
    ],
  });
}
const seeds: [string, string, string, string, number, 'easy' | 'moderate', Artwork, string][] = [
  [
    'bicycle-brake',
    'Get to know a bicycle brake',
    'A closer look at the small adjustments that keep a daily ride feeling right.',
    'Bicycles',
    20,
    'moderate',
    'bicycle',
    'a bicycle',
  ],
  [
    'desk-lamp',
    'Understand your desk lamp',
    'Learn the parts of a familiar object, from its weighted base to the shade.',
    'Home & living',
    15,
    'easy',
    'lamp',
    'a desk lamp',
  ],
  [
    'mechanical-keyboard',
    'Inside a mechanical keyboard',
    'A clear introduction to keycaps, switches, and a thoughtfully organized workspace.',
    'Electronics',
    25,
    'easy',
    'keyboard',
    'a disconnected keyboard',
  ],
  [
    'headphones',
    'Know your everyday headphones',
    'Explore the construction of the things you listen with every day.',
    'Electronics',
    15,
    'easy',
    'headphones',
    'a pair of headphones',
  ],
  [
    'camera',
    'Meet the parts of a camera',
    'A visual walk around the controls, body, and lens of a familiar companion.',
    'Electronics',
    30,
    'moderate',
    'camera',
    'a camera',
  ],
  [
    'workbench',
    'Set up a repair workspace',
    'Make a little room for careful work, useful tools, and the next good idea.',
    'Home & living',
    10,
    'easy',
    'bench',
    'your work mat',
  ],
];
const publicGuides: DemoGuide[] = seeds.map(
  ([id, title, summary, category, minutes, difficulty, artwork, subject]) => ({
    id,
    title,
    summary,
    category,
    document: document(title, summary, minutes, difficulty, subject),
    artwork,
    workspaceId: 'repair-collective',
    audience: 'public',
    state: 'published',
    author: 'Repair collective',
    updatedAt: '2026-09-18T10:00:00Z',
    release: 1,
  }),
);
const guides: DemoGuide[] = [
  ...publicGuides,
  {
    ...publicGuides[5]!,
    id: 'bench-handover',
    workspaceId: 'workshop',
    audience: 'members',
    title: 'Prepare a shared workbench',
    summary: 'A consistent starting point for the team, with a clear handover at the end.',
    category: 'Workshop routines',
    author: 'Workshop team',
    document: document(
      'Prepare a shared workbench',
      'A consistent starting point for the team, with a clear handover at the end.',
      10,
      'easy',
      'the work mat',
    ),
  },
  {
    ...publicGuides[0]!,
    id: 'inspection-checklist',
    workspaceId: 'workshop',
    audience: 'members',
    title: 'Walk through an incoming inspection',
    summary: 'An example team procedure that turns a repeatable task into shared knowledge.',
    category: 'Inspection',
    author: 'Workshop team',
    document: document(
      'Walk through an incoming inspection',
      'An example team procedure that turns a repeatable task into shared knowledge.',
      20,
      'moderate',
      'the sample assembly',
    ),
  },
  {
    ...publicGuides[1]!,
    id: 'private-note',
    audience: 'members',
    title: 'Members-only sample',
    summary: 'This record must not appear in anonymous results.',
  },
  {
    ...publicGuides[2]!,
    id: 'unpublished-sample',
    state: 'draft',
    title: 'Draft sample',
    summary: 'This record must not appear in release results.',
  },
  {
    ...publicGuides[3]!,
    id: 'withdrawn-sample',
    state: 'withdrawn',
    title: 'Withdrawn sample',
    summary: 'This record must not appear in release results.',
  },
];
/** Only synthetic data. Production identity/storage adapters must never be wired into the preview routes. */
export function createDemoQueries() {
  return createGuideQueries({
    getWorkspace: (id: string) => workspaces.find((w) => w.id === id) ?? null,
    getMembership: (actorId: string, workspaceId: string) =>
      memberships.find((m) => m.actorId === actorId && m.workspaceId === workspaceId) ?? null,
    listGuides: (workspaceId: string) => guides.filter((g) => g.workspaceId === workspaceId),
  });
}
