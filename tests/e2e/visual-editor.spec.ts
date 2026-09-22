import { test, expect, type Page, type Locator } from '@playwright/test';
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
import AxeBuilder from '@axe-core/playwright';
const workspace = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Visual editor test',
  audience: 'public',
  isRoot: true,
  role: 'manage',
};
const guideId = '33333333-3333-4333-8333-333333333333';
const initial = {
  id: guideId,
  workspaceId: workspace.id,
  title: 'Visual instructions',
  summary: 'Editable instructions',
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
    schemaVersion: 1,
    title: 'Visual instructions',
    summary: 'Editable instructions',
    locale: 'en',
    difficulty: 'easy',
    durationMinutes: 10,
    tools: [],
    steps: [
      {
        id: '44444444-4444-4444-8444-444444444444',
        title: 'First step',
        body: [
          {
            type: 'paragraph',
            children: [{ type: 'text', text: 'Starting instructions', marks: [] }],
          },
        ],
        media: [],
        callouts: [],
      },
    ],
  },
};
async function openEditor(page: Page) {
  let stored = structuredClone(initial);
  await page.route('**/api/studio/session', (route) =>
    route.fulfill({
      json: {
        user: { id: 'owner', name: 'Owner', email: 'owner@test.local' },
        workspaces: [workspace],
      },
    }),
  );
  await page.route(`**/api/studio/${workspace.id}/guides/${guideId}`, (route) => {
    if (route.request().method() === 'PUT')
      stored = { ...stored, ...route.request().postDataJSON(), version: stored.version + 1 };
    return route.fulfill({ json: { guide: stored } });
  });
  await page.goto(`/studio/${workspace.id}/${guideId}`);
  const field = page.getByRole('textbox', { name: 'Instructions', exact: true });
  await expect(field).toHaveAttribute('contenteditable', 'true');
  return field;
}
async function insert(page: Page, name: string) {
  await page.getByRole('button', { name: 'Insert elements', exact: true }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}
async function selectText(field: Locator, text: string) {
  await field.evaluate((element, target) => {
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const start = (node.textContent ?? '').indexOf(target);
      if (start < 0) continue;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + target.length);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      (element as HTMLElement).focus();
      return;
    }
    throw new Error('Text selection target was not found');
  }, text);
}

test('formatting changes the selected text directly with active controls and undo/redo', async ({
  page,
}) => {
  const field = await openEditor(page);
  await expect(
    page.locator('textarea').filter({ has: page.getByText('Starting instructions') }),
  ).toHaveCount(0);
  await field.fill('Use steady pressure and work slowly.');
  await selectText(field, 'steady pressure');
  await page.getByRole('button', { name: 'Bold', exact: true }).click();
  await expect(field.locator('strong')).toHaveText('steady pressure');
  await expect(page.getByRole('button', { name: 'Bold', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(field.locator('strong')).toHaveCount(0);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(field.locator('strong')).toHaveText('steady pressure');
  await selectText(field, 'work slowly');
  await field.press(process.platform === 'darwin' ? 'Meta+i' : 'Control+i');
  await expect(field.locator('em')).toHaveText('work slowly');
  await page.getByRole('button', { name: 'Text style', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Heading 2', exact: true }).click();
  await expect(field.locator('h2')).toContainText('Use steady pressure');
  await expect(field).not.toContainText('**');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(field.locator('h2 strong')).toHaveText('steady pressure');
  await expect(field.locator('h2 em')).toHaveText('work slowly');
});

test('panels are immediately editable and change tone without accidental nesting', async ({
  page,
}) => {
  const field = await openEditor(page);
  await field.fill('');
  await insert(page, 'Info panel');
  const panel = field.locator('[data-type="panel"]');
  await expect(panel).toHaveCount(1);
  await expect(panel).toHaveAttribute('data-tone', 'info');
  await panel.locator('[data-node-view-content] p').first().click();
  await page.keyboard.insertText('Disconnect the power supply.');
  await expect(panel).toContainText('Disconnect the power supply.');
  await page.getByRole('button', { name: 'Panel type', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Warning', exact: true }).click();
  await expect(panel).toHaveAttribute('data-tone', 'warning');
  await panel.locator('[data-node-view-content] p').first().click();
  await insert(page, 'Note panel');
  await expect(panel).toHaveCount(1);
  await expect(panel).toHaveAttribute('data-tone', 'note');
  await expect(panel.locator('[data-type="panel"]')).toHaveCount(0);
  await expect(field).not.toContainText('[!');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(panel).toHaveAttribute('data-tone', 'note');
  await expect(panel).toContainText('Disconnect the power supply.');
});

test('real table cells support typing, row/column edits and an editable panel inside a cell', async ({
  page,
}) => {
  const field = await openEditor(page);
  await field.fill('');
  await insert(page, 'Table');
  const table = field.locator('table');
  await expect(table).toHaveCount(1);
  for (const [index, label] of ['Part', 'Quantity', 'Check'].entries()) {
    await table.locator('th').nth(index).click();
    await page.keyboard.insertText(label);
  }
  const cell = table.locator('tr').nth(1).locator('td').first();
  await cell.click();
  await page.keyboard.insertText('Seal');
  await expect(cell).toHaveText('Seal');
  await page.keyboard.press('Tab');
  await page.keyboard.insertText('2');
  await expect(table.locator('tr').nth(1).locator('td').nth(1)).toHaveText('2');
  const rows = await table.locator('tr').count();
  await page.getByRole('button', { name: 'Table options', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Insert row below', exact: true }).click();
  await expect(table.locator('tr')).toHaveCount(rows + 1);
  await table.locator('tr').nth(2).locator('td').first().click();
  await page.getByRole('button', { name: 'Table options', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete row', exact: true }).click();
  await expect(table.locator('tr')).toHaveCount(rows);
  const cols = await table.locator('tr').first().locator('th,td').count();
  await page.getByRole('button', { name: 'Table options', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Insert column right', exact: true }).click();
  await expect(table.locator('tr').first().locator('th,td')).toHaveCount(cols + 1);
  await table.locator('tr').nth(1).locator('td').nth(1).click();
  await page.getByRole('button', { name: 'Table options', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Delete column', exact: true }).click();
  await expect(table.locator('tr').first().locator('th,td')).toHaveCount(cols);
  await cell.click();
  await insert(page, 'Info panel');
  const panel = cell.locator('[data-type="panel"]');
  await expect(panel).toHaveCount(1);
  await selectText(field, 'Seal');
  await page.keyboard.insertText('Inspect before reuse.');
  await page.getByRole('button', { name: 'Bulleted list', exact: true }).click();
  await expect(panel.locator('li')).toContainText('Inspect before reuse.');
  await expect(panel.locator('ul')).toHaveCSS('list-style-type', 'disc');
  await page.getByRole('button', { name: 'Numbered list', exact: true }).click();
  await expect(panel.locator('ol')).toHaveCSS('list-style-type', 'decimal');
  await page.getByRole('button', { name: 'Bulleted list', exact: true }).click();
  await expect(panel).toContainText('Inspect before reuse.');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(table.locator('td [data-type="panel"]')).toContainText('Inspect before reuse.');
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await cell.evaluate((element) => element.getBoundingClientRect().width),
  ).toBeGreaterThanOrEqual(180);
  expect(
    await field
      .locator('.tableWrapper')
      .evaluate((element) => element.scrollWidth > element.clientWidth),
  ).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const scrollRegion = page.getByRole('region', {
    name: 'Scrollable instruction table',
    exact: true,
  });
  // Cell keyboard navigation must reveal off-screen columns without page-wide scrolling.
  await table.locator('th').first().click();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect
    .poll(() => scrollRegion.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  await scrollRegion.evaluate((element) => (element.scrollLeft = 0));
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await expect(table.locator('td [data-type="panel"]')).toBeVisible();
  expect(
    (await new AxeBuilder({ page }).include('.studio-editor-canvas').analyze()).violations,
  ).toEqual([]);
  await page
    .locator('.studio-editor-canvas')
    .screenshot({ path: test.info().outputPath('visual-editor-mobile.png') });
});

test('insert menu is keyboard accessible and Escape returns focus without changing the guide', async ({
  page,
}) => {
  await openEditor(page);
  const trigger = page.getByRole('button', { name: 'Insert elements', exact: true });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menu')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toBeHidden();
  await expect(trigger).toBeFocused();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
});

test('links are visual and validated, rich paste is editable, and unsupported paste is explicit', async ({
  page,
}) => {
  const field = await openEditor(page);
  await field.fill('Read the manual.');
  await selectText(field, 'manual');
  await page.getByRole('button', { name: 'Underline', exact: true }).click();
  await page.getByRole('button', { name: 'Link', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Link address', exact: true })
    .fill('javascript:alert(1)');
  await page.getByRole('button', { name: 'Apply link', exact: true }).click();
  await expect(
    page.getByText('Enter a full https://, http:// or mailto: address.', { exact: true }),
  ).toBeVisible();
  await expect(field.locator('a')).toHaveCount(0);
  await page
    .getByRole('textbox', { name: 'Link address', exact: true })
    .fill('https://example.com/manual');
  await page.getByRole('button', { name: 'Apply link', exact: true }).click();
  await expect(field.locator('a')).toHaveAttribute('href', 'https://example.com/manual');
  await expect(field.locator('u')).toHaveText('manual');
  await field.press('ArrowRight');
  await field.press('ArrowRight');
  await field.press('Enter');
  await field.evaluate((element) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData('text/html', '<p><strong>Pasted bold</strong> and <em>italic</em></p>');
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
    );
  });
  await expect(field.locator('strong')).toContainText('Pasted bold');
  await expect(field.locator('em')).toContainText('italic');
  const before = await field.textContent();
  await field.evaluate((element) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData(
      'text/html',
      '<img src="missing" onerror="alert(1)"><p>Unsupported paste</p>',
    );
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }),
    );
  });
  await expect(page.getByText(/This paste contains active or embedded content/)).toBeVisible();
  await expect(field).toHaveText(before!);
  await expect(field.locator('img')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(field.locator('a').first()).toHaveAttribute('href', 'https://example.com/manual');
});

test('oversized unsaved visual content survives step switching and can be corrected', async ({
  page,
}) => {
  const field = await openEditor(page);
  await field.fill('x'.repeat(100001));
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Add step', exact: true }).click();
  await field.fill('Second step remains editable.');
  await page.getByRole('button', { name: '01 First step', exact: true }).click();
  await expect(field).toHaveText('x'.repeat(100001));
  await expect(page.getByRole('button', { name: 'Save draft', exact: true })).toBeDisabled();
  await field.fill('Corrected instructions.');
  await expect(field).toHaveAttribute('aria-invalid', 'false');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(field).toHaveText('Corrected instructions.');
});

test('panel controls stay beside the document, support keyboard dismissal and remain visible inside cells', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const field = await openEditor(page);
  await page.getByLabel('Step title', { exact: true }).fill('Prepare the workspace');
  await field.fill('Before you begin');
  await page.getByRole('button', { name: 'Text style', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Heading 2', exact: true }).click();
  await field.press('ArrowRight');
  await field.press('Enter');
  await page.keyboard.insertText('Gather your tools and keep the removed parts in a small tray.');
  await field.press('Enter');
  await insert(page, 'Info panel');
  const panel = field.getByRole('group', { name: 'Info panel', exact: true });
  await panel.locator('[data-node-view-content] p').click();
  await page.keyboard.insertText('Disconnect the power supply before opening the housing.');
  await page.getByRole('button', { name: 'Exit panel', exact: true }).click();
  await insert(page, 'Table');
  const table = field.locator('table');
  for (const [index, label] of ['Part', 'Quantity', 'Condition'].entries()) {
    await table.locator('th').nth(index).click();
    await page.keyboard.insertText(label);
  }
  await table.locator('td').first().click();
  await page.keyboard.insertText('Housing screws');
  await page.keyboard.press('Tab');
  await page.keyboard.insertText('4');
  await page.keyboard.press('Tab');
  await insert(page, 'Warning panel');
  const cellPanel = table.locator('[data-type="panel"]');
  await cellPanel.locator('[data-node-view-content] p').click();
  await page.keyboard.insertText('Replace if damaged.');
  await page.getByRole('button', { name: 'Panel type', exact: true }).click();
  const menu = page.locator('[data-editor-panel-menu]');
  await expect(menu).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Warning', exact: true })).toBeVisible();
  expect(
    await menu.evaluate((element) => element.closest('[contenteditable], .tableWrapper')),
  ).toBeNull();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Panel type', exact: true })).toBeFocused();
  await expect(menu).toBeHidden();
  await panel.locator('[data-node-view-content] p').click();
  await page.getByRole('button', { name: 'Panel type', exact: true }).click();
  await expect(menu).toBeVisible();
  expect(
    (
      await new AxeBuilder({ page })
        .include('.studio-editor-canvas')
        .include('[data-editor-panel-menu]')
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('editor-polish-desktop.png') });
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Switch to dark theme', exact: true }).click();
  await panel.locator('[data-node-view-content] p').click();
  await page.getByRole('button', { name: 'Panel type', exact: true }).click();
  expect(
    (
      await new AxeBuilder({ page })
        .include('.studio-editor-canvas')
        .include('[data-editor-panel-menu]')
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('editor-polish-dark.png') });
  await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 844 });
  await cellPanel.locator('[data-node-view-content] p').click();
  await page.getByRole('button', { name: 'Panel type', exact: true }).click();
  const bounds = await menu.boundingBox();
  expect(bounds?.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(844);
  await page.getByRole('menuitem', { name: 'Success', exact: true }).click();
  await expect(cellPanel).toHaveAttribute('data-tone', 'success');
  await expect(field).not.toContainText('Panel type');
});

async function hoverBoundary(
  page: Page,
  cell: Locator,
  xEdge: 'left' | 'right',
  yEdge: 'top' | 'bottom',
) {
  await cell.scrollIntoViewIfNeeded();
  const bounds = await cell.boundingBox();
  if (!bounds) throw new Error('Table cell is not visible');
  await page.mouse.move(
    xEdge === 'left' ? bounds.x + 2 : bounds.x + bounds.width - 2,
    yEdge === 'top' ? bounds.y + 2 : bounds.y + bounds.height - 2,
  );
}
async function tableAction(page: Page, name: string) {
  await page.getByRole('button', { name: 'Table options', exact: true }).click();
  await page.getByRole('menuitem', { name, exact: true }).click();
}

test('hover insertion chooses exact column and row boundaries, preserves data and supports undo and saved reload', async ({
  page,
}) => {
  const field = await openEditor(page);
  await field.fill('');
  await insert(page, 'Table');
  const table = field.locator('table');
  for (const [index, label] of ['Left', 'Middle', 'Right'].entries()) {
    await table.locator('th').nth(index).click();
    await page.keyboard.insertText(label);
  }
  await table.locator('td').first().click();
  await page.keyboard.insertText('Keep this cell');
  await hoverBoundary(page, table.locator('th').first(), 'right', 'bottom');
  await page.getByRole('button', { name: 'Insert column at position 2', exact: true }).click();
  await expect(table.locator('th')).toHaveText(['Left', '', 'Middle', 'Right']);
  await expect(table.locator('td').first()).toHaveText('Keep this cell');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(table.locator('th')).toHaveText(['Left', 'Middle', 'Right']);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(table.locator('th')).toHaveText(['Left', '', 'Middle', 'Right']);
  await hoverBoundary(page, table.locator('th').first(), 'left', 'top');
  await page.getByRole('button', { name: 'Insert column at position 1', exact: true }).click();
  await expect(table.locator('th')).toHaveText(['', 'Left', '', 'Middle', 'Right']);
  await hoverBoundary(page, table.locator('th').last(), 'right', 'top');
  await page.getByRole('button', { name: 'Insert column at position 6', exact: true }).click();
  await expect(table.locator('th')).toHaveText(['', 'Left', '', 'Middle', 'Right', '']);
  // Insert a body row between existing rows, before the header, then after the last row.
  await hoverBoundary(page, table.locator('tr').nth(1).locator('td').first(), 'left', 'bottom');
  await page.getByRole('button', { name: 'Insert row at position 3', exact: true }).click();
  await expect(table.locator('tr')).toHaveCount(4);
  await expect(table.locator('tr').nth(1)).toContainText('Keep this cell');
  await hoverBoundary(page, table.locator('tr').first().locator('th,td').first(), 'left', 'top');
  await page.getByRole('button', { name: 'Insert row at position 1', exact: true }).click();
  await expect(table.locator('tr')).toHaveCount(5);
  await expect(table.locator('tr').nth(2)).toContainText('Keep this cell');
  await hoverBoundary(page, table.locator('tr').last().locator('th,td').first(), 'left', 'bottom');
  await page.getByRole('button', { name: 'Insert row at position 6', exact: true }).click();
  await expect(table.locator('tr')).toHaveCount(6);
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await expect(page.getByText('All changes saved', { exact: true })).toBeVisible();
  await page.reload();
  await expect(table.locator('tr')).toHaveCount(6);
  await expect(table.locator('tr').nth(1).locator('th,td')).toHaveText([
    '',
    'Left',
    '',
    'Middle',
    'Right',
    '',
  ]);
  await expect(table.locator('tr').nth(2)).toContainText('Keep this cell');
  await expect(field).not.toContainText('Insert column at position');
});

test('hover targets the table under the pointer independently of the caret and exposes clear insertion cues', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  const field = await openEditor(page);
  await field.fill('');
  await insert(page, 'Table');
  const first = field.locator('table').first();
  await first.locator('th').first().click();
  await page.keyboard.insertText('First table');
  await page.keyboard.press('Tab');
  await page.keyboard.insertText('Quantity');
  await page.keyboard.press('Tab');
  await page.keyboard.insertText('Status');
  await tableAction(page, 'Exit table');
  await insert(page, 'Table');
  const second = field.locator('table').nth(1);
  await second.locator('th').first().click();
  await page.keyboard.insertText('Second table');
  await page.keyboard.press('Tab');
  await page.keyboard.insertText('Quantity');
  await page.keyboard.press('Tab');
  await page.keyboard.insertText('Status');
  await expect(
    page.getByRole('region', { name: 'Scrollable instruction table 1', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Scrollable instruction table 2', exact: true }),
  ).toBeVisible();
  // The scan below judges a finished editor, so settle one first. Typing into a
  // header reaches the document a moment after the keystroke, and on a loaded
  // machine the scan could arrive first and report every header as empty — a
  // true reading of a state no reader ever sees.
  //
  // This waits before the hover, not after: hovering a boundary renders a
  // preview column, so a header count taken mid-interaction is a different
  // shape again and would make this assertion flake in the other direction.
  await expect(first.locator('th')).toHaveText(['First table', 'Quantity', 'Status']);
  await expect(second.locator('th')).toHaveText(['Second table', 'Quantity', 'Status']);

  await hoverBoundary(page, first.locator('th').first(), 'right', 'top');
  const plus = page.getByRole('button', { name: 'Insert column at position 2', exact: true });
  await expect(plus).toBeVisible();
  await plus.hover();
  await expect(page.locator('.rte-table-insertion-line--column')).toHaveClass(/is-emphasized/);
  expect(
    (
      await new AxeBuilder({ page })
        .include('.studio-editor-canvas')
        .include('[data-table-insertion-controls]')
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('table-hover-insertion.png') });
  await plus.click();
  await expect(first.locator('th')).toHaveCount(4);
  await expect(second.locator('th')).toHaveCount(3);
  await expect(second).toContainText('Second table');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(first.locator('th')).toHaveCount(3);
  await expect(second.locator('th')).toHaveCount(3);
  await hoverBoundary(page, first.locator('th').first(), 'right', 'bottom');
  await page.keyboard.press('Escape');
  await expect(
    page.getByRole('group', { name: 'Table insertion controls', exact: true }),
  ).toBeHidden();
});

test('touch and keyboard table options insert on either side of the selected cell', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
  });
  const page = await context.newPage();
  const field = await openEditor(page);
  await field.fill('');
  await insert(page, 'Table');
  const table = field.locator('table');
  await table.locator('th').first().tap();
  await page.keyboard.insertText('Anchor');
  await expect(
    page.getByRole('button', { name: 'Insert column at position 2', exact: true }),
  ).toBeVisible();
  await tableAction(page, 'Insert column left');
  await expect(table.locator('th')).toHaveText(['', 'Anchor', '', '']);
  await table.locator('th').nth(1).tap();
  await tableAction(page, 'Insert column right');
  await expect(table.locator('th')).toHaveText(['', 'Anchor', '', '', '']);
  await table.locator('tr').nth(1).locator('td').first().tap();
  await tableAction(page, 'Insert row above');
  await expect(table.locator('tr')).toHaveCount(4);
  await table.locator('tr').nth(2).locator('td').first().tap();
  const menu = page.getByRole('button', { name: 'Table options', exact: true });
  await menu.focus();
  await page.keyboard.press('Enter');
  await page.getByRole('menuitem', { name: 'Insert row below', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(table.locator('tr')).toHaveCount(5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});
