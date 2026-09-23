import { StepRequirementsSummary } from './requirements';
import { annotationPercent, servedImageWidths } from '@guide/content';
import type { GuideDocument, GuideStep, TextRun, RichNode, RichMark } from '@guide/content';
import { Info, TriangleAlert, CircleAlert, CircleCheck, GitBranch, StickyNote } from 'lucide-react';
import { Fragment, createElement, type ReactNode } from 'react';
import './step-body.css';

/**
 * The tones a panel can take, as the colours each one uses. Kept beside the
 * panel's label and icon so a new tone cannot be added without all three.
 */
const panelTone = {
  info: 'border-info-line bg-info-surface text-info',
  note: 'border-note-line bg-note-surface text-note',
  warning: 'border-warning-line bg-warning-surface text-warning',
  danger: 'border-error-line bg-error-surface text-error',
  success: 'border-success-line bg-success-surface text-success',
  decision: 'border-[var(--gp-semantic-accent-border)] bg-accent-surface text-accent-ink',
};
const panelClass =
  'mx-0 my-5 rounded-[8px] border border-solid px-4.5 py-4 [border-inline-start-width:4px] first:mt-0 last:mb-0 [&>:last-child]:mb-0';
const panelLabelClass = 'mb-2 flex items-center gap-2 text-[0.875em]';
const tableScrollClass =
  'instruction-table-scroll mx-0 my-5 max-w-full overflow-x-auto rounded-[8px] border border-solid border-line first:mt-0 last:mb-0';
export function StepRenderer({
  step,
  index,
  illustration,
  document,
  mediaSrc,
}: {
  document?: GuideDocument;
  step: GuideStep;
  index: number;
  illustration?: ReactNode;
  /**
   * Where to fetch a picture. Supplied by the page rather than built here, so
   * this component stays independent of routing, and omitted where images
   * cannot be served — a preview of unsaved work, or a text-only export.
   */
  /** Where a picture is served from. A width asks for that rendering of it. */
  mediaSrc?: (assetId: string, width?: number) => string;
}) {
  return (
    <section
      className="reader-step mb-9 scroll-mt-[30px] border-b border-solid border-b-line pb-9"
      id={`step-${step.id}`}
      aria-labelledby={`heading-${step.id}`}
    >
      <div className="mb-6 flex items-center gap-4">
        <span className="inline-flex size-8.75 shrink-0 items-center justify-center rounded-[7px] bg-action font-mono text-[12px] text-action-ink">
          {String(index + 1).padStart(2, '0')}
        </span>
        <h2
          id={`heading-${step.id}`}
          className="text-[24px] leading-[1.3] font-medium tracking-[-0.6px] max-[760px]:text-[22px]"
        >
          {step.title}
        </h2>
      </div>
      <div className="step-layout">
        {illustration && (
          <div className="mb-[26px] overflow-hidden rounded-panel border border-solid border-line [&_.artwork--detail]:aspect-[2.2] max-[760px]:[&_.artwork--detail]:aspect-[1.7]">
            {illustration}
          </div>
        )}
        <div className="step-content max-w-reading text-[17px] leading-[1.8]">
          <StepRequirementsSummary document={document} step={step} />
          <StepBody body={step.body} />
          {step.callouts.map((callout, i) => (
            <aside
              className={`mt-5 flex items-start gap-[13px] rounded-control border border-solid p-[18px] [&>svg]:mt-0.5 [&>svg]:shrink-0 ${callout.tone === 'warning' ? panelTone.warning : panelTone.info}`}
              key={i}
            >
              {callout.tone === 'warning' ? <TriangleAlert size={19} /> : <Info size={19} />}
              <div>
                <h3 className="mb-1.5 text-[12px] font-bold">{callout.title}</h3>
                <p className="text-[12px] leading-[1.8]">{callout.body}</p>
              </div>
            </aside>
          ))}
          {step.media.length > 0 &&
            (mediaSrc ? (
              step.media.map((media) => (
                <StepMedia
                  key={media.assetId}
                  media={media}
                  src={mediaSrc(media.assetId)}
                  widths={(width) => mediaSrc(media.assetId, width)}
                />
              ))
            ) : (
              <p className="mb-5">Pictures appear once this guide is saved.</p>
            ))}
        </div>
      </div>
    </section>
  );
}

/**
 * One picture and its marks.
 *
 * Annotations are drawn as numbered markers positioned over the image, and
 * repeated underneath as an ordinary list. Someone who cannot see the overlay
 * still gets every label, in order, which a purely visual marker would deny
 * them.
 */
function StepMedia({
  media,
  src,
  widths,
}: {
  media: GuideStep['media'][number];
  src: string;
  widths?: (width: number) => string;
}) {
  const percent = annotationPercent;
  const arrows = media.annotations.filter((a) => a.type === 'arrow');
  // One arrowhead definition per image. The id is derived from the asset so two
  // images on a page cannot borrow each other's marker.
  const head = `step-media-arrowhead-${media.assetId}`;
  return (
    <figure className="step-media mx-0 mt-5 mb-0">
      <div className="relative block overflow-hidden rounded-[12px] border border-solid border-line bg-sunken">
        <img
          className="block h-auto w-full"
          src={src}
          // The browser knows the screen and the connection; it picks. sizes
          // says the picture is the column width, so a phone takes the 400.
          srcSet={
            widths ? servedImageWidths.map((w) => `${widths(w)} ${w}w`).join(', ') : undefined
          }
          sizes="(max-width: 760px) 100vw, 720px"
          alt={media.alt}
          loading="lazy"
          decoding="async"
        />
        {arrows.length > 0 && (
          <svg
            className="step-media-arrows pointer-events-none absolute inset-0 size-full"
            aria-hidden="true"
          >
            <defs>
              {/* markerUnits scales the head with the stroke rather than with
                  the viewport, so it keeps its shape at any image size. */}
              <marker
                id={head}
                markerWidth="6"
                markerHeight="6"
                refX="5"
                refY="3"
                orient="auto"
                markerUnits="strokeWidth"
              >
                <path className="fill-action" d="M0,0 L6,3 L0,6 Z" />
              </marker>
            </defs>
            {arrows.map((arrow, index) => (
              <line
                className="stroke-action [stroke-linecap:round] [stroke-width:3]"
                key={index}
                x1={percent(arrow.x)}
                y1={percent(arrow.y)}
                x2={percent(arrow.toX)}
                y2={percent(arrow.toY)}
                markerEnd={`url(#${head})`}
              />
            ))}
          </svg>
        )}
        {media.annotations.map((annotation, index) => (
          <span
            key={index}
            className="step-media-mark absolute inline-flex h-6.5 min-w-[26px] [transform:translate(-50%,-50%)] items-center justify-center rounded-[999px] border-2 border-solid border-raised bg-action text-[12px] font-bold text-action-ink [box-shadow:0_1px_4px_rgb(0_0_0_/_0.3)]"
            style={{ left: percent(annotation.x), top: percent(annotation.y) }}
            aria-hidden="true"
          >
            {/* Numbered by position in the list, so a marker and its legend
                entry always carry the same number. */}
            {index + 1}
          </span>
        ))}
      </div>
      {(media.caption || media.annotations.length > 0) && (
        <figcaption>
          {/* The caption is for everyone; alt text stands in for the picture
              when it cannot be seen. They are different jobs, so a caption is
              never used as a substitute for the description. */}
          {media.caption && (
            <p className="step-media-caption mx-0 mt-2.5 mb-0 text-[14px] text-muted">
              {media.caption}
            </p>
          )}
          {media.annotations.length > 0 && (
            <ol className="step-media-legend mx-0 mt-2.5 mb-0 grid gap-1 pl-5.5 text-[14px] text-muted">
              {media.annotations.map((annotation, index) => (
                <li key={index}>{annotation.label}</li>
              ))}
            </ol>
          )}
        </figcaption>
      )}
    </figure>
  );
}

const panelAppearance = {
  info: { label: 'Information', Icon: Info },
  note: { label: 'Note', Icon: StickyNote },
  warning: { label: 'Warning', Icon: TriangleAlert },
  danger: { label: 'Error / danger', Icon: CircleAlert },
  success: { label: 'Success', Icon: CircleCheck },
  decision: { label: 'Decision', Icon: GitBranch },
};
function InlineText({ runs }: { runs: TextRun[] }) {
  return runs.map((run, index) => {
    let content: ReactNode = run.text;
    for (const mark of run.marks)
      content =
        mark === 'bold' ? (
          <strong>{content}</strong>
        ) : mark === 'italic' ? (
          <em>{content}</em>
        ) : (
          <code>{content}</code>
        );
    return <Fragment key={index}>{content}</Fragment>;
  });
}
export function StepBody({ body }: { body: GuideStep['body'] }) {
  return (
    <div className="instruction-body">
      {body.map((block, index) => {
        if (block.type === 'richText') return <RichContent node={block.document} key={index} />;
        if (block.type === 'paragraph')
          return (
            <p key={index}>
              <InlineText runs={block.children} />
            </p>
          );
        if (block.type === 'heading')
          return createElement(
            `h${Math.min(6, block.level + 2)}`,
            { key: index },
            <InlineText runs={block.children} />,
          );
        if (block.type === 'bulletList')
          return (
            <ul key={index}>
              {block.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          );
        if (block.type === 'list') {
          const items = block.items.map((item, i) => (
            <li key={i}>
              <InlineText runs={item} />
            </li>
          ));
          return block.ordered ? (
            <ol key={index} start={block.start}>
              {items}
            </ol>
          ) : (
            <ul key={index}>{items}</ul>
          );
        }
        if (block.type === 'quote')
          return (
            <blockquote key={index}>
              <StepBody body={block.children} />
            </blockquote>
          );
        if (block.type === 'panel') {
          const { label, Icon } = panelAppearance[block.tone];
          return (
            <aside
              role="note"
              aria-label={label}
              className={`instruction-panel instruction-panel--${block.tone} ${panelClass} ${panelTone[block.tone]}`}
              key={index}
            >
              <div className={panelLabelClass}>
                <Icon size={18} aria-hidden="true" />
                <strong>{label}</strong>
              </div>
              <StepBody body={block.children} />
            </aside>
          );
        }
        return (
          <div
            className={tableScrollClass}
            role="region"
            aria-label="Instruction table"
            tabIndex={0}
            key={index}
          >
            <table>
              <thead>
                <tr>
                  {block.headers.map((cell, i) => (
                    <th scope="col" key={i} style={{ textAlign: block.align[i] ?? undefined }}>
                      <InlineText runs={cell} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j} style={{ textAlign: block.align[j] ?? undefined }}>
                        <InlineText runs={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function MarkedContent({ content, marks }: { content: ReactNode; marks?: RichMark[] }) {
  let result = content;
  for (const mark of marks ?? []) {
    if (mark.type === 'bold') result = <strong>{result}</strong>;
    else if (mark.type === 'italic') result = <em>{result}</em>;
    else if (mark.type === 'underline') result = <u>{result}</u>;
    else if (mark.type === 'strike') result = <s>{result}</s>;
    else if (mark.type === 'code') result = <code>{result}</code>;
    else if (mark.type === 'link')
      result = (
        <a href={mark.attrs.href} rel="noopener noreferrer">
          {result}
        </a>
      );
  }
  return result;
}

/** Render the validated content tree with semantic React elements, never author-provided HTML. */
function RichContent({ node }: { node: RichNode }): ReactNode {
  if (node.type === 'text') return <MarkedContent content={node.text} marks={node.marks} />;
  if (node.type === 'hardBreak') return <br />;
  const content = node.content.map((child, index) => <RichContent node={child} key={index} />);
  if (node.type === 'doc') return content;
  if (node.type === 'paragraph')
    return <p style={{ textAlign: node.attrs?.textAlign }}>{content}</p>;
  if (node.type === 'heading')
    return createElement(
      `h${Math.min(6, node.attrs.level + 2)}`,
      { style: { textAlign: node.attrs.textAlign } },
      content,
    );
  if (node.type === 'bulletList') return <ul>{content}</ul>;
  if (node.type === 'orderedList') return <ol start={node.attrs.start}>{content}</ol>;
  if (node.type === 'listItem') return <li>{content}</li>;
  if (node.type === 'blockquote') return <blockquote>{content}</blockquote>;
  if (node.type === 'panel') {
    const { label, Icon } = panelAppearance[node.attrs.tone];
    return (
      <aside
        role="note"
        aria-label={label}
        className={`instruction-panel instruction-panel--${node.attrs.tone} ${panelClass} ${panelTone[node.attrs.tone]}`}
      >
        <div className={panelLabelClass}>
          <Icon size={18} aria-hidden="true" />
          <strong>{label}</strong>
        </div>
        {content}
      </aside>
    );
  }
  if (node.type === 'table') {
    const hasHeader = node.content[0]?.content.every((cell) => cell.type === 'tableHeader');
    return (
      <div className={tableScrollClass} role="region" aria-label="Instruction table" tabIndex={0}>
        <table>
          {hasHeader && (
            <thead>
              <RichContent node={node.content[0]!} />
            </thead>
          )}
          <tbody>
            {(hasHeader ? node.content.slice(1) : node.content).map((row, index) => (
              <RichContent node={row} key={index} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (node.type === 'tableRow') return <tr>{content}</tr>;
  if (node.type === 'tableHeader')
    return (
      <th scope="col" style={{ textAlign: node.attrs?.align }}>
        {content}
      </th>
    );
  return <td style={{ textAlign: node.attrs?.align }}>{content}</td>;
}
