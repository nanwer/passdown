import type { Locator, Page } from '@playwright/test';

export async function selectText(field: Locator, text: string) {
  await field.evaluate((element, target) => {
    (element as HTMLElement).focus();
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
      return;
    }
    throw new Error('Text selection target was not found');
  }, text);
}

export async function dispatchPaste(field: Locator, content: { html?: string; text?: string }) {
  await field.evaluate((element, payload) => {
    const clipboardData = new DataTransfer();
    if (payload.html !== undefined) clipboardData.setData('text/html', payload.html);
    if (payload.text !== undefined) clipboardData.setData('text/plain', payload.text);
    const event = new ClipboardEvent('paste', { bubbles: true, cancelable: true });
    // Firefox discards DataTransfer passed in the synthetic event constructor.
    Object.defineProperty(event, 'clipboardData', { value: clipboardData });
    element.dispatchEvent(event);
  }, content);
}

export async function pressTab(page: Page, options: { shift?: boolean } = {}) {
  // macOS WebKit's default navigation skips buttons without Option.
  const option =
    process.platform === 'darwin' && page.context().browser()?.browserType().name() === 'webkit';
  await page.keyboard.press(`${option ? 'Alt+' : ''}${options.shift ? 'Shift+' : ''}Tab`);
}

export const modifier = 'ControlOrMeta';

export async function instantScrollTo(page: Page, top: number) {
  await page.evaluate((position) => window.scrollTo({ top: position, behavior: 'instant' }), top);
}

export const browserContextOptions = { locale: 'en-US', timezoneId: 'UTC' };
