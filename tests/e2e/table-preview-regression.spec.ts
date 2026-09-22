import { test, expect } from '@playwright/test';
test.beforeEach(async ({ page }) => {
  await page.route('**/api/studio/*/catalog**', (route) => route.fulfill({ json: { items: [] } }));
  await page.route('**/api/studio/*/categories**', (route) =>
    route.fulfill({
      json: {
        categories: [
          {
            id: '55555555-5555-4555-8555-555555555555',
            workspaceId: '22222222-2222-4222-8222-222222222222',
            domain: 'guide',
            parentId: null,
            name: 'Testing',
            description: '',
            visibility: 'public',
            archived: false,
            version: 1,
            sortOrder: 0,
            path: [{ id: '55555555-5555-4555-8555-555555555555', name: 'Testing' }],
          },
        ],
      },
    }),
  );
});

test('table and panel editor can unmount for Preview and reopen repeatedly', async ({ page }) => {
  const workspace = {
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Preview test',
    audience: 'public',
    isRoot: true,
    role: 'manage',
  };
  const guideId = '33333333-3333-4333-8333-333333333333';
  const paragraph = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
  const panel = (text: string) => ({
    type: 'panel',
    attrs: { tone: 'warning' },
    content: [paragraph(text)],
  });
  const cell = (text: string, header = false) => ({
    type: header ? 'tableHeader' : 'tableCell',
    content: [paragraph(text)],
  });
  const guide = {
    id: guideId,
    workspaceId: workspace.id,
    title: 'Preview table',
    summary: 'Preview roundtrip',
    category: 'Testing',
    categoryId: '55555555-5555-4555-8555-555555555555',
    categoryPath: [{ id: '55555555-5555-4555-8555-555555555555', name: 'Testing' }],
    audience: 'public',
    version: 1,
    currentRelease: null,
    publishedVersion: null,
    updatedAt: '2026-09-19T12:00:00Z',
    stepCount: 1,
    document: {
      schemaVersion: 3,
      title: 'Preview table',
      summary: 'Preview roundtrip',
      locale: 'en',
      difficulty: 'easy',
      durationMinutes: 10,
      tools: [],
      steps: [
        {
          id: '44444444-4444-4444-8444-444444444444',
          title: 'First step',
          media: [],
          callouts: [],
          body: [
            {
              type: 'richText',
              document: {
                type: 'doc',
                content: [
                  paragraph('Preparation'),
                  panel('Keep the original fasteners.'),
                  {
                    type: 'table',
                    content: [
                      {
                        type: 'tableRow',
                        content: [cell('Part', true), cell('Quantity', true), cell('Check', true)],
                      },
                      {
                        type: 'tableRow',
                        content: [
                          cell('Seal'),
                          cell('1'),
                          { type: 'tableCell', content: [panel('Replace if cracked.')] },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          ],
        },
      ],
    },
  };
  await page.route('**/api/studio/session', (route) =>
    route.fulfill({
      json: {
        user: { id: 'owner', name: 'Owner', email: 'owner@test.local' },
        workspaces: [workspace],
      },
    }),
  );
  await page.route(`**/api/studio/${workspace.id}/guides/${guideId}`, (route) =>
    route.fulfill({ json: { guide } }),
  );
  await page.goto(`/studio/${workspace.id}/${guideId}`);
  for (let pass = 0; pass < 3; pass++) {
    const field = page.getByRole('textbox', { name: 'Instructions', exact: true });
    await expect(field.locator('td [data-type="panel"]')).toContainText('Replace if cracked.');
    await field.locator('th').first().hover();
    await page.getByRole('button', { name: 'Preview', exact: true }).click();
    await expect(page.locator('.studio-live-preview td .instruction-panel')).toContainText(
      'Replace if cracked.',
    );
    await page.getByRole('button', { name: 'Edit step', exact: true }).click();
  }
});
