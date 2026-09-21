import {
  formatRequirementQuantity,
  type GuideDocument,
  type GuideRequirement,
  type GuideStep,
} from '@guide/content';
import { Wrench, Package, TriangleAlert, CheckCircle2 } from 'lucide-react';
import './requirements.css';

function RequirementDetails({ requirement }: { requirement: GuideRequirement }) {
  const identity = [requirement.manufacturer, requirement.model, requirement.partNumber]
    .filter(Boolean)
    .join(' · ');
  return (
    <>
      <strong>{requirement.name}</strong>
      {requirement.specification && (
        <span className="requirement-specification">{requirement.specification}</span>
      )}
      {identity && <small>{identity}</small>}
      {requirement.description && <p>{requirement.description}</p>}
    </>
  );
}
export function PreparationList({ document }: { document: GuideDocument }) {
  if (document.schemaVersion !== 5)
    return (
      <div className="tool-list">
        <h2>
          <Wrench size={17} />
          Before you begin
        </h2>
        <ul>
          {document.tools.map((tool, index) => (
            <li key={index}>{tool}</li>
          ))}
        </ul>
      </div>
    );
  return (
    <section className="preparation-list" aria-label="Guide preparation">
      <h2>Before you begin</h2>
      {(['keep', 'use'] as const).map((role) => {
        const items = document.requirements.filter((item) => item.role === role);
        if (!items.length) return null;
        const Icon = role === 'keep' ? Wrench : Package;
        return (
          <div className="preparation-group" key={role}>
            <h3>
              <Icon size={16} aria-hidden="true" />
              {role === 'keep' ? 'What you need to hand' : 'What gets used up'}
            </h3>
            <ul>
              {items.map((item) => {
                const steps = document.steps.flatMap((step, index) =>
                  step.requirements.some((usage) => usage.requirementId === item.id)
                    ? [{ step, index }]
                    : [],
                );
                return (
                  <li key={item.id} id={`requirement-${item.id}`}>
                    <RequirementDetails requirement={item} />
                    <div className="requirement-badges">
                      <span>{formatRequirementQuantity(item.quantity, item.unit)}</span>
                      {item.optional && <span>Optional</span>}
                    </div>
                    {item.notes && <p>{item.notes}</p>}
                    {steps.length > 0 && (
                      <div className="requirement-steps">
                        Used in{' '}
                        {steps.map(({ step, index }, linkIndex) => (
                          <span key={step.id}>
                            {linkIndex > 0 && ', '}
                            <a href={`#step-${step.id}`}>step {index + 1}</a>
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
        <div className="preparation-group">
          <h3>Original preparation notes</h3>
          <ul>
            {document.unresolvedTools.map((entry) => (
              <li key={entry.id}>
                {entry.label}
                <small>Catalog selection needed before publishing</small>
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
        <section className="step-prerequisites" aria-label="Before this step">
          <h3>Before this step</h3>
          {earlier.length > 0 && (
            <ul>
              {earlier.map((id) => {
                const index = document?.steps.findIndex((entry) => entry.id === id) ?? -1;
                return (
                  <li key={id}>
                    {index >= 0 ? (
                      <a href={`#step-${id}`}>
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
                className={`step-precondition step-precondition--${condition.tone}`}
                role="note"
                key={condition.id}
              >
                <Icon size={18} aria-hidden="true" />
                <p>{condition.text}</p>
              </div>
            );
          })}
        </section>
      )}
      {usages.length > 0 && (
        <section className="step-needed" aria-label="Needed for this step">
          <h3>Needed for this step</h3>
          <ul>
            {usages.map((usage) => {
              const requirement =
                document?.schemaVersion === 5
                  ? document.requirements.find((entry) => entry.id === usage.requirementId)
                  : undefined;
              if (!requirement)
                return <li key={usage.requirementId}>Preparation item unavailable</li>;
              return (
                <li key={usage.requirementId}>
                  <a href={`#requirement-${requirement.id}`}>
                    <strong>{requirement.name}</strong>
                  </a>
                  {requirement.specification && <span>{requirement.specification}</span>}
                  <div className="requirement-badges">
                    <span>{formatRequirementQuantity(usage.quantity, usage.unit)}</span>
                    {usage.optional && <span>Optional</span>}
                    {requirement.role === 'use' && (
                      <span>
                        {usage.mode === 'consume' ? 'Use a new one' : 'Reuse the same one'}
                      </span>
                    )}
                  </div>
                  {usage.notes && <p>{usage.notes}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
