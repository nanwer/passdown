import { expect, it } from 'vitest';
import { hasInstructionText, parseStepMarkdown } from './index';
it.each([
  'Text',
  '# Heading',
  '- Item',
  '1. **Item**',
  '> Quote',
  '> [!NOTE]\n> Information',
  '> [!WARNING]\n> Warning',
  '> [!CAUTION]\n> Danger',
  '> [!TIP]\n> Tip',
  '> [!DECISION]\n> Choice',
  '| Part |\n| --- |\n| Screw |',
])('recognizes meaningful instruction content in %s', (source) => {
  expect(hasInstructionText(parseStepMarkdown(source).body)).toBe(true);
});
it.each(['', '   ', '> [!WARNING]', '> [!DECISION]'])(
  'does not treat empty instructions or panel labels as content: %s',
  (source) => {
    expect(hasInstructionText(parseStepMarkdown(source).body)).toBe(false);
  },
);
