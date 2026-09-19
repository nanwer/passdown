import { fromMarkdown } from 'mdast-util-from-markdown';
import { toMarkdown } from 'mdast-util-to-markdown';
import { gfmTableFromMarkdown, gfmTableToMarkdown } from 'mdast-util-gfm-table';
import { gfmTable } from 'micromark-extension-gfm-table';
import type { Nodes, PhrasingContent, RootContent, BlockContent } from 'mdast';
import {
  stepBodySchema,
  legacyFormattedBodySchema,
  type GuideStep,
  type TextRun,
  type LegacyStepBody,
} from './index';
import { normalizeRuns, normalizeStepBody } from './body';
type Body = LegacyStepBody;
type Block = Exclude<Body[number], { type: 'richText' }>;
type SimpleBlock = Exclude<Block, { type: 'panel' | 'quote' | 'table' }>;
const panelMarkers = {
  NOTE: 'info',
  WARNING: 'warning',
  CAUTION: 'danger',
  TIP: 'success',
  DECISION: 'decision',
} as const;
const markerByTone = {
  info: 'NOTE',
  warning: 'WARNING',
  danger: 'CAUTION',
  success: 'TIP',
  decision: 'DECISION',
} as const;
const plain = (text: string, marks: TextRun['marks'] = []): TextRun => ({
  type: 'text',
  text,
  marks,
});
const paragraph = (text: string): SimpleBlock => ({ type: 'paragraph', children: [plain(text)] });

/** Parse a bounded Markdown subset into our safe, versioned document model. Unsupported syntax stays literal. */
export function parseStepMarkdown(source: string): {
  body: Body;
  needsV2: boolean;
  notices: string[];
} {
  if (source.length > 100000)
    throw new Error('Step instructions must contain 100,000 characters or fewer.');
  const notices = new Set<string>();
  const tree = fromMarkdown(source, {
    extensions: [gfmTable()],
    mdastExtensions: [gfmTableFromMarkdown()],
  });
  function literal(node: Nodes): string {
    notices.add('Links, images, HTML, code fences and nested blocks are kept as literal text.');
    return source.slice(
      node.position?.start.offset ?? 0,
      node.position?.end.offset ?? source.length,
    );
  }
  function inline(nodes: PhrasingContent[], marks: TextRun['marks'] = []): TextRun[] {
    const result: TextRun[] = [];
    for (const node of nodes) {
      if (node.type === 'strong' || node.type === 'emphasis') {
        result.push(
          ...inline(node.children, [...marks, node.type === 'strong' ? 'bold' : 'italic']),
        );
      } else if (node.type === 'text') result.push(plain(node.value, marks));
      else if (node.type === 'inlineCode') result.push(plain(node.value, [...marks, 'code']));
      else if (node.type === 'break') result.push(plain('\n', marks));
      else result.push(plain(literal(node), marks));
    }
    return normalizeRuns(result);
  }
  function simple(node: RootContent): SimpleBlock {
    if (node.type === 'paragraph') return { type: 'paragraph', children: inline(node.children) };
    if (node.type === 'heading')
      return { type: 'heading', level: node.depth, children: inline(node.children) };
    if (
      node.type === 'list' &&
      node.children.every(
        (item) => item.children.length === 1 && item.children[0]?.type === 'paragraph',
      )
    ) {
      const items = node.children.map((item) =>
        inline((item.children[0] as Extract<BlockContent, { type: 'paragraph' }>).children),
      );
      if (
        !node.ordered &&
        items.every(
          (item) => item.length === 1 && item[0]!.marks.length === 0 && item[0]!.text.length > 0,
        )
      ) {
        return { type: 'bulletList', items: items.map((item) => item[0]!.text) };
      }
      return { type: 'list', ordered: !!node.ordered, start: Math.max(1, node.start ?? 1), items };
    }
    return paragraph(literal(node));
  }
  function block(node: RootContent): Block {
    if (node.type === 'blockquote') {
      // Nested block containers are retained as source instead of flattened.
      if (node.children.some((child) => child.type === 'blockquote' || child.type === 'table'))
        return paragraph(literal(node));
      const first = node.children[0];
      const firstText =
        first?.type === 'paragraph' && first.children[0]?.type === 'text'
          ? first.children[0].value
          : '';
      const marker = /^\[!(NOTE|WARNING|CAUTION|TIP|DECISION)\](?:\n|$)/.exec(firstText);
      if (
        marker &&
        first?.type === 'paragraph' &&
        source.slice(first.position?.start.offset ?? 0).startsWith(`[!${marker[1]}]`)
      ) {
        const children = structuredClone(node.children);
        const initial = children[0] as Extract<BlockContent, { type: 'paragraph' }>;
        const initialText = initial.children[0] as Extract<PhrasingContent, { type: 'text' }>;
        initialText.value = initialText.value.slice(marker[0].length);
        if (!initialText.value) initial.children.shift();
        if (!initial.children.length) children.shift();
        return {
          type: 'panel',
          tone: panelMarkers[marker[1] as keyof typeof panelMarkers],
          children: children.length ? children.map(simple) : [paragraph('')],
        };
      }
      return { type: 'quote', children: node.children.map(simple) };
    }
    if (node.type === 'table') {
      const width = node.children[0]?.children.length ?? 0;
      // GFM otherwise discards excess cells. Preserve the whole row visibly instead.
      if (node.children.some((row) => row.children.length > width)) return paragraph(literal(node));
      const rows = node.children.map((row) =>
        Array.from({ length: width }, (_, i) => inline(row.children[i]?.children ?? [])),
      );
      return {
        type: 'table',
        headers: rows[0]!,
        rows: rows.slice(1),
        align: Array.from({ length: width }, (_, i) => node.align?.[i] ?? null),
      };
    }
    return simple(node);
  }
  const body = legacyFormattedBodySchema.parse(
    tree.children.length ? tree.children.map(block) : [paragraph('')],
  );
  return {
    body,
    needsV2: body.some((block) => block.type !== 'paragraph' && block.type !== 'bulletList'),
    notices: [...notices],
  };
}

function inlineNodes(runs: TextRun[]): PhrasingContent[] {
  const normalized = normalizeRuns(runs);
  const result: PhrasingContent[] = [];
  for (let i = 0; i < normalized.length;) {
    const run = normalized[i]!;
    const containers = (['bold', 'italic'] as const)
      .filter((mark) => run.marks.includes(mark))
      .map((mark) => {
        let end = i + 1;
        while (end < normalized.length && normalized[end]!.marks.includes(mark)) end++;
        return { mark, end };
      })
      .sort((a, b) => b.end - a.end);
    const container = containers[0];
    if (container) {
      const group = normalized
        .slice(i, container.end)
        .map((item) => ({ ...item, marks: item.marks.filter((mark) => mark !== container.mark) }));
      result.push({
        type: container.mark === 'bold' ? 'strong' : 'emphasis',
        children: inlineNodes(group),
      });
      i = container.end;
      continue;
    }
    if (run.marks.includes('code')) result.push({ type: 'inlineCode', value: run.text });
    else {
      // Entities retain actual paragraph line breaks. Boundary spaces need entities only
      // inside emphasis, where CommonMark would otherwise discard the formatting.
      const parts = run.text.split(/(\n|\r|\t)/).filter(Boolean);
      for (const part of parts)
        result.push(
          /^[\n\r\t]+$/.test(part)
            ? {
                type: 'html',
                value: Array.from(part, (char) => `&#${char.charCodeAt(0)};`).join(''),
              }
            : { type: 'text', value: part },
        );
    }
    i++;
  }
  // A text node at the edge of a marked container is allowed whitespace in our schema.
  // The caller handles its delimiter boundary without changing ordinary spaces.
  return result;
}
function preserveMarkedWhitespace(nodes: PhrasingContent[]): PhrasingContent[] {
  return nodes.map((node) => {
    if (node.type !== 'strong' && node.type !== 'emphasis') return node;
    const children = preserveMarkedWhitespace(node.children);
    for (const index of [...new Set([0, children.length - 1])]) {
      const child = children[index];
      if (child?.type !== 'text') continue;
      const leading = index === 0 ? (/^ +/.exec(child.value)?.[0] ?? '') : '';
      const trailing = index === children.length - 1 ? (/ +$/.exec(child.value)?.[0] ?? '') : '';
      const middle = child.value.slice(
        leading.length,
        child.value.length - trailing.length || undefined,
      );
      const replacements: PhrasingContent[] = [];
      if (leading) replacements.push({ type: 'html', value: '&#32;'.repeat(leading.length) });
      if (middle) replacements.push({ type: 'text', value: middle });
      if (trailing && trailing.length + leading.length <= child.value.length)
        replacements.push({ type: 'html', value: '&#32;'.repeat(trailing.length) });
      children.splice(index, 1, ...replacements);
    }
    return { ...node, children };
  });
}
function markdownNode(block: Block): RootContent {
  if (block.type === 'paragraph')
    return { type: 'paragraph', children: preserveMarkedWhitespace(inlineNodes(block.children)) };
  if (block.type === 'heading')
    return {
      type: 'heading',
      depth: block.level as 1 | 2 | 3 | 4 | 5 | 6,
      children: preserveMarkedWhitespace(inlineNodes(block.children)),
    };
  if (block.type === 'bulletList' || block.type === 'list') {
    const items =
      block.type === 'bulletList' ? block.items.map((item) => [plain(item)]) : block.items;
    return {
      type: 'list',
      ordered: block.type === 'list' && block.ordered,
      start: block.type === 'list' ? block.start : null,
      spread: false,
      children: items.map((item) => ({
        type: 'listItem',
        spread: false,
        children: [{ type: 'paragraph', children: preserveMarkedWhitespace(inlineNodes(item)) }],
      })),
    };
  }
  if (block.type === 'quote')
    return { type: 'blockquote', children: block.children.map(markdownNode) as BlockContent[] };
  if (block.type === 'panel') {
    const children = block.children.map(markdownNode) as BlockContent[];
    // A sentinel raw HTML node serializes the marker without escaping its brackets; it never reaches rendering.
    const marker: BlockContent = { type: 'html', value: `[!${markerByTone[block.tone]}]` };
    return { type: 'blockquote', children: [marker, ...children] };
  }
  return {
    type: 'table',
    align: block.align,
    children: [block.headers, ...block.rows].map((row) => ({
      type: 'tableRow',
      children: row.map((cell) => ({
        type: 'tableCell',
        children: preserveMarkedWhitespace(inlineNodes(cell)),
      })),
    })),
  };
}
export function formatStepMarkdown(body: GuideStep['body']): string {
  if (body.some((block) => block.type === 'richText'))
    throw new Error(
      'Visual rich text cannot be converted to legacy Markdown without losing content.',
    );
  const valid = legacyFormattedBodySchema.parse(normalizeStepBody(stepBodySchema.parse(body)));
  return toMarkdown(
    { type: 'root', children: valid.map(markdownNode) },
    { bullet: '-', emphasis: '*', strong: '_', fences: true, extensions: [gfmTableToMarkdown()] },
  ).trimEnd();
}
