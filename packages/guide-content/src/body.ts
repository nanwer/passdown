import type { GuideStep, TextRun, RichNode } from './index';
export function normalizeRuns(runs: TextRun[]): TextRun[] {
  const result: TextRun[] = [];
  for (const run of runs) {
    if (!run.text) continue;
    const marks = [...new Set(run.marks)].sort() as TextRun['marks'];
    const previous = result.at(-1);
    if (previous && previous.marks.join() === marks.join()) previous.text += run.text;
    else result.push({ type: 'text', text: run.text, marks });
  }
  return result.length ? result : [{ type: 'text', text: '', marks: [] }];
}
export function normalizeStepBody(body: GuideStep['body']): GuideStep['body'] {
  return body.map((block) => {
    if (block.type === 'paragraph' || block.type === 'heading')
      return { ...block, children: normalizeRuns(block.children) };
    if (block.type === 'list') return { ...block, items: block.items.map(normalizeRuns) };
    if (block.type === 'table')
      return {
        ...block,
        headers: block.headers.map(normalizeRuns),
        rows: block.rows.map((row) => row.map(normalizeRuns)),
      };
    if (block.type === 'panel' || block.type === 'quote')
      return { ...block, children: normalizeStepBody(block.children) as typeof block.children };
    return block;
  }) as GuideStep['body'];
}
export function hasInstructionText(body: GuideStep['body']): boolean {
  const containsText = (runs: TextRun[]) => runs.some((run) => !!run.text.trim());
  const richContainsText = (node: RichNode): boolean =>
    node.type === 'text'
      ? !!node.text.trim()
      : 'content' in node && node.content.some(richContainsText);
  return body.some((block) => {
    if (block.type === 'richText') return richContainsText(block.document);
    if (block.type === 'paragraph' || block.type === 'heading') return containsText(block.children);
    if (block.type === 'bulletList') return block.items.some((item) => !!item.trim());
    if (block.type === 'list') return block.items.some(containsText);
    if (block.type === 'quote' || block.type === 'panel') return hasInstructionText(block.children);
    return block.headers.some(containsText) || block.rows.some((row) => row.some(containsText));
  });
}
