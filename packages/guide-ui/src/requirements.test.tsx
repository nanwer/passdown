// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { GuideDocumentV5 } from '@guide/content';
import { PreparationList } from './requirements';
import { StepRenderer } from './step-renderer';
afterEach(cleanup);
const document: GuideDocumentV5 = {
  schemaVersion: 5,
  title: 'Workspace',
  summary: 'A workspace example.',
  locale: 'en',
  difficulty: 'easy',
  durationMinutes: 10,
  tools: [],
  unresolvedTools: [],
  requirements: [
    {
      id: 'requirement-1',
      itemId: 'item-1',
      itemVersion: 1,
      role: 'keep',
      name: 'Precision driver',
      specification: 'Phillips #00',
      description: '',
      manufacturer: 'Example maker',
      model: 'P00',
      partNumber: '',
      quantity: 1,
      unit: 'each',
      optional: false,
      notes: 'An equivalent driver is suitable.',
    },
    {
      id: 'requirement-2',
      itemId: 'item-2',
      itemVersion: 3,
      role: 'use',
      name: 'Replacement screw',
      specification: 'M2 × 4 mm',
      description: '',
      manufacturer: '',
      model: '',
      partNumber: '',
      quantity: 5,
      unit: 'each',
      optional: true,
      notes: '',
    },
  ],
  steps: [1, 2].map((index) => ({
    id: `step-${index}`,
    title: index === 1 ? 'Prepare' : 'Reassemble',
    body: [
      {
        type: 'paragraph',
        children: [{ type: 'text', text: 'Follow the instructions.', marks: [] }],
      },
    ],
    media: [],
    callouts: [],
    requirements: [
      {
        requirementId: 'requirement-1',
        quantity: 1,
        unit: 'each',
        mode: 'reuse',
        optional: false,
        notes: 'Keep the driver upright.',
      },
    ],
    preconditions: [],
    earlierStepIds: [],
  })),
};
it('groups preparation by item type, shows exact snapshots and links every point of use', () => {
  render(<PreparationList document={document} />);
  expect(screen.getByRole('heading', { name: 'What you need to hand' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'What gets used up' })).toBeVisible();
  expect(screen.getByText('Phillips #00')).toBeVisible();
  expect(screen.getByText('Example maker · P00')).toBeVisible();
  expect(screen.getByText('1 each')).toBeVisible();
  expect(screen.getByRole('link', { name: 'step 1' })).toHaveAttribute('href', '#step-step-1');
  expect(screen.getByRole('link', { name: 'step 2' })).toHaveAttribute('href', '#step-step-2');
  expect(screen.getByText('Optional')).toBeVisible();
});
it('shows only this step’s needed items, warnings and an accessible prerequisite link before instructions', () => {
  const step = {
    ...document.steps[1]!,
    earlierStepIds: ['step-1'],
    preconditions: [
      { id: 'condition-1', tone: 'warning' as const, text: 'Verify that the workspace is clear.' },
    ],
  };
  render(<StepRenderer step={step} document={document} index={1} />);
  const needed = screen.getByRole('region', { name: 'Needed for this step' });
  expect(within(needed).getByText('Precision driver')).toBeVisible();
  expect(within(needed).queryByText('Replacement screw')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Complete step 1: Prepare' })).toHaveAttribute(
    'href',
    '#step-step-1',
  );
  expect(screen.getByRole('note')).toHaveTextContent('Verify that the workspace is clear.');
  expect(within(needed).getByRole('link', { name: 'Precision driver' })).toHaveAttribute(
    'href',
    '#requirement-requirement-1',
  );
});
