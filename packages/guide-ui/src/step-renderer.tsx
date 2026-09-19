import { StepRequirementsSummary } from './requirements';
import type { GuideDocument, GuideStep, TextRun, RichNode, RichMark } from '@guide/content';
import { Info, TriangleAlert, CircleAlert, CircleCheck, GitBranch, StickyNote } from 'lucide-react';
import { Fragment, createElement, type ReactNode } from 'react';
import './step-body.css';
export function StepRenderer({
  step,
  index,
  illustration,
  document,
}: {
  document?: GuideDocument;
  step: GuideStep;
  index: number;
  illustration?: ReactNode;
}) {
  return (
    <section className="reader-step" id={`step-${step.id}`} aria-labelledby={`heading-${step.id}`}>
      <div className="step-heading">
        <span className="step-number">{String(index + 1).padStart(2, '0')}</span>
        <h2 id={`heading-${step.id}`}>{step.title}</h2>
      </div>
      <div className="step-layout">
        {illustration && <div className="step-illustration">{illustration}</div>}
        <div className="step-content">
          <StepRequirementsSummary document={document} step={step} />
          <StepBody body={step.body} />
          {step.callouts.map((callout, i) => (
            <aside className={`callout callout--${callout.tone}`} key={i}>
              {callout.tone === 'warning' ? <TriangleAlert size={19} /> : <Info size={19} />}
              <div>
                <h3>{callout.title}</h3>
                <p>{callout.body}</p>
              </div>
            </aside>
          ))}
          {step.media.length > 0 && (
            <p className="media-unavailable">Media is unavailable in this text preview.</p>
          )}
        </div>
      </div>
    </section>
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
              className={`instruction-panel instruction-panel--${block.tone}`}
              key={index}
            >
              <div className="instruction-panel-label">
                <Icon size={18} aria-hidden="true" />
                <strong>{label}</strong>
              </div>
              <StepBody body={block.children} />
            </aside>
          );
        }
        return (
          <div
            className="instruction-table-scroll"
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
        className={`instruction-panel instruction-panel--${node.attrs.tone}`}
      >
        <div className="instruction-panel-label">
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
      <div
        className="instruction-table-scroll"
        role="region"
        aria-label="Instruction table"
        tabIndex={0}
      >
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
