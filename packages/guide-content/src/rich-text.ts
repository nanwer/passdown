import { z } from 'zod';
import type { GuideStep, TextRun } from './index';

export type RichPanelTone = 'info' | 'note' | 'warning' | 'danger' | 'success' | 'decision';
export type RichAlignment = 'left' | 'center' | 'right';
export type RichMark =
  | { type: 'bold' | 'italic' | 'underline' | 'strike' | 'code' }
  | { type: 'link'; attrs: { href: string } };
export type RichInline =
  { type: 'text'; text: string; marks?: RichMark[] } | { type: 'hardBreak'; marks?: RichMark[] };
export type RichParagraph = {
  type: 'paragraph';
  attrs?: { textAlign: RichAlignment };
  content: RichInline[];
};
export type RichListItem = { type: 'listItem'; content: RichBlock[] };
export type RichCell = {
  type: 'tableCell' | 'tableHeader';
  attrs?: { align: RichAlignment };
  content: RichBlock[];
};
export type RichRow = { type: 'tableRow'; content: RichCell[] };
export type RichBlock =
  | RichParagraph
  | { type: 'heading'; attrs: { level: number; textAlign?: RichAlignment }; content: RichInline[] }
  | { type: 'bulletList'; content: RichListItem[] }
  | { type: 'orderedList'; attrs: { start: number }; content: RichListItem[] }
  | { type: 'blockquote'; content: RichBlock[] }
  | { type: 'panel'; attrs: { tone: RichPanelTone }; content: RichBlock[] }
  | { type: 'table'; content: RichRow[] };
export type RichDocument = { type: 'doc'; content: RichBlock[] };
export type RichNode = RichDocument | RichBlock | RichListItem | RichCell | RichRow | RichInline;

const blockTypes = [
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'blockquote',
  'panel',
  'table',
];
const markTypes = ['bold', 'italic', 'underline', 'strike', 'code', 'link'];
const tones = ['info', 'note', 'warning', 'danger', 'success', 'decision'];
const alignments = ['left', 'center', 'right'];
const fail = (message: string): never => {
  throw new Error(message);
};
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail('Rich text must use structured objects.');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null)
    return fail('Rich text must contain plain objects.');
  return value as Record<string, unknown>;
};
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    fail('Unsupported rich text attribute or node field.');
}
function integer(value: unknown, minimum: number, maximum: number) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < minimum || value > maximum)
    fail('Rich text number is outside its allowed range.');
  return value as number;
}
export function isSafeRichTextHref(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length > 2048 ||
    !/^(https?:\/\/|mailto:)/i.test(value) ||
    /[\s\u0000-\u001f\u007f]/u.test(value)
  )
    return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? !!url.hostname
      : url.protocol === 'mailto:' && !!url.pathname;
  } catch {
    return false;
  }
}

/** The persisted format is independent of any editor library. Only known safe editor defaults can be normalized. */
function parseRichDocument(value: unknown, editorDefaults: boolean): RichDocument {
  let nodes = 0;
  let textLength = 0;
  function marks(value: unknown): RichMark[] | undefined {
    if (value === undefined) return undefined;
    if (!Array.isArray(value) || value.length > 6) return fail('Unsupported rich text marks.');
    const seen = new Set<string>();
    return value.map((item) => {
      const mark = record(item);
      keys(mark, ['type', 'attrs']);
      if (typeof mark.type !== 'string' || !markTypes.includes(mark.type) || seen.has(mark.type))
        return fail('Unsupported or duplicate rich text mark.');
      seen.add(mark.type);
      if (mark.type !== 'link') {
        if (mark.attrs !== undefined) fail('This formatting mark cannot have attributes.');
        return { type: mark.type } as RichMark;
      }
      const attrs = record(mark.attrs);
      keys(attrs, editorDefaults ? ['href', 'target', 'rel', 'class', 'title'] : ['href']);
      if (!isSafeRichTextHref(attrs.href))
        fail('Links must use a valid http, https or mailto address.');
      if (editorDefaults) {
        if (attrs.target !== undefined && attrs.target !== null && attrs.target !== '_blank')
          fail('Unsupported link target.');
        if (
          attrs.rel !== undefined &&
          attrs.rel !== null &&
          attrs.rel !== 'noopener noreferrer nofollow'
        )
          fail('Unsupported link relationship.');
        if (
          (attrs.class !== undefined && attrs.class !== null) ||
          (attrs.title !== undefined && attrs.title !== null)
        )
          fail('Unsupported link metadata.');
      }
      return { type: 'link', attrs: { href: attrs.href as string } };
    });
  }
  function alignment(value: unknown): RichAlignment | undefined {
    if (value === undefined || (editorDefaults && value === null)) return undefined;
    if (typeof value !== 'string' || !alignments.includes(value))
      return fail('Unsupported text alignment.');
    return value as RichAlignment;
  }
  function visit(
    value: unknown,
    allowed: string[],
    depth: number,
    inPanel: boolean,
    inTable: boolean,
  ): RichNode {
    if (depth > 12) return fail('Rich text nesting exceeds the supported depth of twelve.');
    if (++nodes > 2000) return fail('Step instructions may contain at most 2,000 content nodes.');
    const node = record(value);
    keys(node, ['type', 'attrs', 'content', 'text', 'marks']);
    if (typeof node.type !== 'string' || !allowed.includes(node.type))
      return fail('Unsupported rich text node in this position.');
    const type = node.type;
    const attrs = node.attrs === undefined ? {} : record(node.attrs);
    if (type === 'text' || type === 'hardBreak') {
      if (node.content !== undefined || node.attrs !== undefined)
        fail('Inline text cannot contain blocks or attributes.');
      const inlineMarks = marks(node.marks);
      if (type === 'hardBreak') {
        if (node.text !== undefined) fail('Line breaks cannot contain text.');
        return { type, ...(inlineMarks?.length ? { marks: inlineMarks } : {}) };
      }
      if (typeof node.text !== 'string' || !node.text.length || node.text.length > 100000)
        fail('Text nodes must contain between 1 and 100,000 characters.');
      textLength += (node.text as string).length;
      if (textLength > 100000) fail('Step instructions may contain at most 100,000 characters.');
      return {
        type,
        text: node.text as string,
        ...(inlineMarks?.length ? { marks: inlineMarks } : {}),
      };
    }
    if (node.text !== undefined || node.marks !== undefined)
      fail('Block nodes cannot carry text or formatting marks directly.');
    const content =
      node.content === undefined && (type === 'paragraph' || type === 'heading')
        ? []
        : node.content;
    if (!Array.isArray(content) || content.length > 2000)
      return fail('Rich text nodes require a bounded content list.');
    if (!content.length && type !== 'paragraph' && type !== 'heading')
      fail('This rich text block must contain content.');
    const children = (types: string[], panel = inPanel, table = inTable) =>
      content.map((child) => visit(child, types, depth + 1, panel, table));
    if (type === 'paragraph' || type === 'heading') {
      keys(attrs, type === 'heading' ? ['level', 'textAlign'] : ['textAlign']);
      const textAlign = alignment(attrs.textAlign);
      const content = children(['text', 'hardBreak']) as RichInline[];
      if (type === 'heading')
        return {
          type,
          attrs: { level: integer(attrs.level, 1, 6), ...(textAlign ? { textAlign } : {}) },
          content,
        };
      return { type, ...(textAlign ? { attrs: { textAlign } } : {}), content };
    }
    if (type === 'panel') {
      keys(attrs, ['tone']);
      if (inPanel) fail('Panels cannot be nested inside other panels.');
      if (typeof attrs.tone !== 'string' || !tones.includes(attrs.tone))
        fail('Unsupported panel type.');
      return {
        type,
        attrs: { tone: attrs.tone as RichPanelTone },
        content: children(blockTypes, true) as RichBlock[],
      };
    }
    if (type === 'bulletList' || type === 'orderedList') {
      keys(attrs, type === 'orderedList' ? (editorDefaults ? ['start', 'type'] : ['start']) : []);
      if (attrs.type !== undefined && attrs.type !== null) fail('Unsupported numbered list style.');
      const content = children(['listItem']) as RichListItem[];
      return type === 'orderedList'
        ? {
            type,
            attrs: {
              start: integer(attrs.start ?? (editorDefaults ? 1 : undefined), 1, 999999999),
            },
            content,
          }
        : { type, content };
    }
    if (type === 'tableCell' || type === 'tableHeader') {
      keys(attrs, editorDefaults ? ['colspan', 'rowspan', 'colwidth', 'align'] : ['align']);
      if (
        editorDefaults &&
        ((attrs.colspan !== undefined && attrs.colspan !== 1) ||
          (attrs.rowspan !== undefined && attrs.rowspan !== 1) ||
          (attrs.colwidth !== undefined && attrs.colwidth !== null))
      )
        fail('Merged or fixed-width table cells are not supported.');
      const align = alignment(attrs.align);
      return {
        type,
        ...(align ? { attrs: { align } } : {}),
        content: children(blockTypes) as RichBlock[],
      };
    }
    keys(attrs, []);
    if (type === 'table') {
      if (inTable) fail('Tables cannot be nested inside other tables.');
      // V2 allowed 50 body rows plus its header; preserve that historical capacity.
      if (content.length > 51) fail('Tables may contain at most 51 rows, including the header.');
      const rows = children(['tableRow'], inPanel, true) as RichRow[];
      const width = rows[0]!.content.length;
      if (rows.some((row) => row.content.length !== width))
        fail('Every table row must have the same number of columns.');
      return { type, content: rows };
    }
    if (type === 'tableRow') {
      if (content.length > 10) fail('Tables may contain at most 10 columns.');
      return { type, content: children(['tableHeader', 'tableCell']) as RichCell[] };
    }
    if (type === 'listItem') {
      const blocks = children(blockTypes) as RichBlock[];
      if (blocks[0]?.type !== 'paragraph') fail('A list item must begin with a paragraph.');
      return { type, content: blocks };
    }
    return { type: type as 'doc' | 'blockquote', content: children(blockTypes) as RichBlock[] };
  }
  return visit(value, ['doc'], 0, false, false) as RichDocument;
}

export const richDocumentSchema = z.unknown().transform((value, context): RichDocument => {
  try {
    return parseRichDocument(value, false);
  } catch (error) {
    context.addIssue({
      code: 'custom',
      message: error instanceof Error ? error.message : 'Invalid rich text content.',
    });
    return z.NEVER;
  }
});

/** Validate and normalize a library-produced JSON document before it enters our versioned model. */
export function editorDocumentToBody(document: unknown): GuideStep['body'] {
  return [{ type: 'richText', document: parseRichDocument(document, true) }];
}

/** Convert legacy blocks without going through HTML or Markdown and without mutating old releases. */
export function bodyToEditorDocument(body: GuideStep['body']): RichDocument {
  if (body.length === 1 && body[0]?.type === 'richText')
    return richDocumentSchema.parse(body[0].document);
  function inline(runs: TextRun[]): RichInline[] {
    return runs.flatMap((run) => {
      const marks = [...new Set(run.marks)].map((type) => ({ type })) as RichMark[];
      const format = marks.length ? { marks } : {};
      const result: RichInline[] = [];
      run.text.split('\n').forEach((text, index) => {
        if (index) result.push({ type: 'hardBreak', ...format });
        if (text) result.push({ type: 'text', text, ...format });
      });
      return result;
    });
  }
  function block(item: GuideStep['body'][number]): RichBlock {
    if (item.type === 'richText') return fail('Visual rich text must be the only body block.');
    if (item.type === 'paragraph') return { type: 'paragraph', content: inline(item.children) };
    if (item.type === 'heading')
      return { type: 'heading', attrs: { level: item.level }, content: inline(item.children) };
    if (item.type === 'quote') return { type: 'blockquote', content: item.children.map(block) };
    if (item.type === 'panel')
      return { type: 'panel', attrs: { tone: item.tone }, content: item.children.map(block) };
    if (item.type === 'bulletList' || item.type === 'list') {
      const items =
        item.type === 'bulletList'
          ? item.items.map((text) => [{ type: 'text' as const, text, marks: [] }])
          : item.items;
      const content: RichListItem[] = items.map((runs) => ({
        type: 'listItem',
        content: [{ type: 'paragraph', content: inline(runs) }],
      }));
      return item.type === 'list' && item.ordered
        ? { type: 'orderedList', attrs: { start: item.start }, content }
        : { type: 'bulletList', content };
    }
    return {
      type: 'table',
      content: [item.headers, ...item.rows].map((row, index) => ({
        type: 'tableRow',
        content: row.map((runs, column) => ({
          type: index === 0 ? 'tableHeader' : 'tableCell',
          ...(item.align[column] ? { attrs: { align: item.align[column]! } } : {}),
          content: [{ type: 'paragraph', content: inline(runs) }],
        })),
      })),
    };
  }
  return richDocumentSchema.parse({ type: 'doc', content: body.map(block) });
}
