import {
  formatRequirementQuantity,
  type GuideDocument,
  type GuideRequirement,
  type GuideStep,
} from '@guide/content';
import { Wrench, Package, TriangleAlert, CheckCircle2 } from 'lucide-react';

const badgesClass = 'my-1 flex flex-wrap gap-1.5';
const badgeClass =
  'rounded-[5px] border border-solid border-line px-[7px] py-0.5 text-[11px] text-muted';
const noteClass = 'mx-0 my-0.5 text-[13px] leading-[1.5] text-muted';
const linkClass = 'underline underline-offset-[3px]';
const bareList = 'm-0 list-none p-0';
const groupClass = '[&+&]:mt-6';
const groupHeading = 'mt-0 mb-3 flex items-center gap-2 text-[13px]';
const itemClass =
  'grid scroll-mt-[100px] gap-[5px] border-t border-solid border-t-line py-3.5 text-[13px] wrap-anywhere';
const stepHeading = 'mt-0 mb-3 text-[14px]';
const neededClass =
  'grid gap-[5px] rounded-[8px] border border-solid border-line p-3 text-[13px] wrap-anywhere';

function RequirementDetails({ requirement }: { requirement: GuideRequirement }) {
  const identity = [requirement.manufacturer, requirement.model, requirement.partNumber]
    .filter(Boolean)
    .join(' · ');
  return (
    <>
      <strong className="font-[650]">{requirement.name}</strong>
      {requirement.specification && (
        <span className="text-[12px] text-muted">{requirement.specification}</span>
      )}
      {identity && <small className="text-[12px] text-muted">{identity}</small>}
      {requirement.description && <p className={noteClass}>{requirement.description}</p>}
    </>
  );
}
export function PreparationList({ document }: { document: GuideDocument }) {
  if (document.schemaVersion !== 5)
    return (
      <div className="mt-7 border-y border-solid border-y-line py-[25px] max-[760px]:mt-[22px]">
        <h2 className="flex items-center gap-2.5 text-[13px] font-semibold">
          <Wrench size={17} />
          Before you begin
        </h2>
        <ul className="mx-0 mt-4 mb-0 list-disc ps-4 text-[12px] text-muted">
          {document.tools.map((tool, index) => (
            <li className="py-1" key={index}>
              {tool}
            </li>
          ))}
        </ul>
      </div>
    );
  return (
    <section className="my-7" aria-label="Guide preparation">
      <h2 className="mt-0 mb-5 text-[17px]">Before you begin</h2>
      {(['keep', 'use'] as const).map((role) => {
        const items = document.requirements.filter((item) => item.role === role);
        if (!items.length) return null;
        const Icon = role === 'keep' ? Wrench : Package;
        return (
          <div className={groupClass} key={role}>
            <h3 className={groupHeading}>
              <Icon size={16} aria-hidden="true" />
              {role === 'keep' ? 'What you need to hand' : 'What gets used up'}
            </h3>
            <ul className={bareList}>
              {items.map((item) => {
                const steps = document.steps.flatMap((step, index) =>
                  step.requirements.some((usage) => usage.requirementId === item.id)
                    ? [{ step, index }]
                    : [],
                );
                return (
                  <li className={itemClass} key={item.id} id={`requirement-${item.id}`}>
                    <RequirementDetails requirement={item} />
                    <div className={badgesClass}>
                      <span className={badgeClass}>
                        {formatRequirementQuantity(item.quantity, item.unit)}
                      </span>
                      {item.optional && <span className={badgeClass}>Optional</span>}
                    </div>
                    {item.notes && <p className={noteClass}>{item.notes}</p>}
                    {steps.length > 0 && (
                      <div className="text-[12px] text-muted">
                        Used in{' '}
                        {steps.map(({ step, index }, linkIndex) => (
                          <span key={step.id}>
                            {linkIndex > 0 && ', '}
                            <a className={linkClass} href={`#step-${step.id}`}>
                              step {index + 1}
                            </a>
                          </span>
                        ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
      {document.unresolvedTools.length > 0 && (
        <div className={groupClass}>
          <h3 className={groupHeading}>Original preparation notes</h3>
          <ul className={bareList}>
            {document.unresolvedTools.map((entry) => (
              <li className={itemClass} key={entry.id}>
                {entry.label}
                <small className="text-[12px] text-muted">
                  Catalog selection needed before publishing
                </small>
              </li>
            ))}
          </ul>
        </div>
      )}
      {document.requirements.length === 0 && document.unresolvedTools.length === 0 && (
        <p>No special tools or materials listed.</p>
      )}
    </section>
  );
}
export function StepRequirementsSummary({
  document,
  step,
}: {
  document?: GuideDocument;
  step: GuideStep;
}) {
  const usages = step.requirements ?? [];
  const conditions = step.preconditions ?? [];
  const earlier = step.earlierStepIds ?? [];
  return (
    <>
      {(conditions.length > 0 || earlier.length > 0) && (
        <section className="mt-0 mb-6" aria-label="Before this step">
          <h3 className={stepHeading}>Before this step</h3>
          {earlier.length > 0 && (
            <ul className="ps-5 text-[14px]">
              {earlier.map((id) => {
                const index = document?.steps.findIndex((entry) => entry.id === id) ?? -1;
                return (
                  <li key={id}>
                    {index >= 0 ? (
                      <a className={linkClass} href={`#step-${id}`}>
                        Complete step {index + 1}: {document?.steps[index]?.title}
                      </a>
                    ) : (
                      <span>Earlier step unavailable</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {conditions.map((condition) => {
            const Icon = condition.tone === 'warning' ? TriangleAlert : CheckCircle2;
            return (
              <div
                className={`my-2 flex items-start gap-2.5 rounded-[8px] border border-solid border-line bg-panel px-3.5 py-3 [&>svg]:mt-0.5 [&>svg]:shrink-0 ${condition.tone === 'warning' ? 'border-s-[3px] border-s-warning-line' : ''}`}
                role="note"
                key={condition.id}
              >
                <Icon size={18} aria-hidden="true" />
                <p className="m-0 text-[14px] leading-[1.6]">{condition.text}</p>
              </div>
            );
          })}
        </section>
      )}
      {usages.length > 0 && (
        <section className="mt-0 mb-6" aria-label="Needed for this step">
          <h3 className={stepHeading}>Needed for this step</h3>
          <ul className="m-0 grid list-none grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-2.5 p-0">
            {usages.map((usage) => {
              const requirement =
                document?.schemaVersion === 5
                  ? document.requirements.find((entry) => entry.id === usage.requirementId)
                  : undefined;
              if (!requirement)
                return (
                  <li className={neededClass} key={usage.requirementId}>
                    Preparation item unavailable
                  </li>
                );
              return (
                <li className={neededClass} key={usage.requirementId}>
                  <a className={linkClass} href={`#requirement-${requirement.id}`}>
                    <strong>{requirement.name}</strong>
                  </a>
                  {requirement.specification && (
                    <span className="text-muted">{requirement.specification}</span>
                  )}
                  <div className={badgesClass}>
                    <span className={badgeClass}>
                      {formatRequirementQuantity(usage.quantity, usage.unit)}
                    </span>
                    {usage.optional && <span className={badgeClass}>Optional</span>}
                    {requirement.role === 'use' && (
                      <span className={badgeClass}>
                        {usage.mode === 'consume' ? 'Use a new one' : 'Reuse the same one'}
                      </span>
                    )}
                  </div>
                  {usage.notes && <p className={noteClass}>{usage.notes}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
