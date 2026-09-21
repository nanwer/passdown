// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import '@testing-library/jest-dom/vitest';
import type { CatalogItem, StudioWorkspace } from '@guide/contracts';
import type { GuideDocumentV4 } from '@guide/content';
import { GuideRequirements, requirementFromCatalog } from './guide-requirements';
import { StepRequirements } from './step-requirements';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), item: undefined as CatalogItem | undefined }));
vi.mock('./transport', () => ({ studioFetch: mocks.fetch }));
vi.mock('../structured', () => ({
  CatalogPicker: ({
    label = 'Pick item',
    onSelect,
    disabled,
    visibility,
  }: {
    label?: string;
    onSelect: (item: CatalogItem) => void;
    disabled?: boolean;
    visibility?: 'public' | 'members';
  }) => (
    <button
      type="button"
      disabled={disabled}
      data-catalog-visibility={visibility}
      onClick={() => onSelect(mocks.item!)}
    >
      {label}
    </button>
  ),
}));
const id = (index: number) => `10000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const workspace: StudioWorkspace = {
  id: id(1),
  name: 'Workspace',
  audience: 'public',
  role: 'owner',
};
const item: CatalogItem = {
  id: id(2),
  workspaceId: id(1),
  kind: 'tool',
  name: 'Precision driver',
  specification: 'Phillips #00',
  description: '',
  manufacturer: '',
  model: '',
  partNumber: '',
  defaultUnit: 'each',
  visibility: 'public',
  archived: false,
  version: 1,
};
function empty(): GuideDocumentV4 {
  return {
    schemaVersion: 4,
    title: 'Procedure',
    summary: 'Prepare.',
    locale: 'en',
    difficulty: 'easy',
    durationMinutes: 10,
    tools: [],
    requirements: [],
    unresolvedTools: [],
    steps: [1, 2].map((index) => ({
      id: id(10 + index),
      title: `Step ${index}`,
      body: [{ type: 'paragraph', children: [{ type: 'text', text: 'Prepare.', marks: [] }] }],
      media: [],
      callouts: [],
      requirements: [],
      preconditions: [],
      earlierStepIds: [],
    })),
  };
}
function Harness({
  initial,
  stepId,
  audience,
}: {
  initial: GuideDocumentV4;
  stepId?: string;
  audience?: 'public' | 'members';
}) {
  const [document, onChange] = useState(initial);
  return (
    <>
      {stepId ? (
        <StepRequirements
          document={document}
          workspace={workspace}
          audience={audience}
          onChange={onChange}
          stepId={stepId}
        />
      ) : (
        <GuideRequirements
          document={document}
          workspace={workspace}
          audience={audience}
          onChange={onChange}
        />
      )}
      <pre data-testid="document">{JSON.stringify(document)}</pre>
    </>
  );
}
function current(): GuideDocumentV4 {
  return JSON.parse(screen.getByTestId('document').textContent!) as GuideDocumentV4;
}
beforeEach(() => {
  mocks.fetch.mockReset().mockResolvedValue({ items: [item] });
  mocks.item = item;
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);
describe('catalog-backed preparation authoring', () => {
  it.each(['public', 'members'] as const)(
    'uses the actual %s guide audience for preparation selection and privacy notices',
    async (audience) => {
      const document = empty();
      document.requirements = [requirementFromCatalog(item)];
      mocks.fetch.mockResolvedValue({ items: [{ ...item, version: 2, visibility: 'members' }] });
      render(<Harness initial={document} audience={audience} />);
      await screen.findByRole('button', { name: /Catalog update available/ });
      expect(screen.getByRole('button', { name: 'Add tool' })).toHaveAttribute(
        'data-catalog-visibility',
        audience,
      );
      expect(screen.getByRole('button', { name: 'Add material' })).toHaveAttribute(
        'data-catalog-visibility',
        audience,
      );
      if (audience === 'public')
        expect(screen.getByText(/This catalog item is private/)).toBeVisible();
      else expect(screen.queryByText(/This catalog item is private/)).not.toBeInTheDocument();
    },
  );

  it('resolves original wording into a snapshot, preserves the note and avoids duplicate quantities', async () => {
    const document = empty();
    document.unresolvedTools = [{ id: id(90), label: 'Small original driver note' }];
    render(<Harness initial={document} />);
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: 'Link Small original driver note' }));
    expect(current().unresolvedTools).toEqual([]);
    expect(current().requirements[0]).toMatchObject({
      itemId: item.id,
      itemVersion: 1,
      specification: 'Phillips #00',
      quantity: null,
      notes: 'Original preparation note: Small original driver note',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add tool' }));
    expect(current().requirements).toHaveLength(1);
    expect(screen.getByRole('status')).toHaveTextContent('already added');
  });
  it('shows newer catalog details for review and preserves confirmed quantity, unit and notes on apply', async () => {
    const document = empty();
    document.requirements = [
      {
        ...requirementFromCatalog(item),
        quantity: 2,
        unit: 'pair',
        notes: 'Keep this guide-specific note.',
      },
    ];
    mocks.fetch.mockResolvedValue({
      items: [
        {
          ...item,
          version: 2,
          name: 'Updated driver',
          specification: 'Phillips #00 revised',
          defaultUnit: 'each',
        },
      ],
    });
    render(<Harness initial={document} />);
    fireEvent.click(await screen.findByRole('button', { name: /Catalog update available/ }));
    expect(current().requirements[0]?.name).toBe('Precision driver');
    expect(screen.getByRole('dialog')).toHaveTextContent('Phillips #00 revised');
    fireEvent.click(screen.getByRole('button', { name: 'Apply item details to draft' }));
    expect(current().requirements[0]).toMatchObject({
      itemVersion: 2,
      name: 'Updated driver',
      quantity: 2,
      unit: 'pair',
      notes: 'Keep this guide-specific note.',
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('keeps draft details on catalog errors and supports retry', async () => {
    mocks.fetch.mockRejectedValueOnce(new Error('Catalog temporarily unavailable.'));
    const document = empty();
    document.requirements = [requirementFromCatalog(item)];
    render(<Harness initial={document} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Retry catalog status' }));
    await waitFor(() =>
      expect(screen.queryByText(/temporarily unavailable/)).not.toBeInTheDocument(),
    );
    expect(current().requirements[0]?.name).toBe(item.name);
  });
  it('confirms removing a preparation requirement and removes its dependent step usages together', async () => {
    const document = empty();
    const requirement = requirementFromCatalog(item);
    document.requirements = [requirement];
    document.steps[0]!.requirements = [
      {
        requirementId: requirement.id,
        quantity: 1,
        unit: 'each',
        mode: 'reuse',
        optional: false,
        notes: '',
      },
    ];
    render(<Harness initial={document} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Precision driver from guide' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('steps 1');
    expect(current().requirements).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Remove from guide' }));
    expect(current().requirements).toEqual([]);
    expect(current().steps[0]?.requirements).toEqual([]);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
describe('requirements at the point of use', () => {
  it.each(['public', 'members'] as const)(
    'uses the actual %s guide audience when selecting or creating items from a step',
    (audience) => {
      render(<Harness initial={empty()} stepId={id(11)} audience={audience} />);
      expect(screen.getByRole('button', { name: 'Add from catalog' })).toHaveAttribute(
        'data-catalog-visibility',
        audience,
      );
    },
  );

  it('uses level-two authoring sections and level-three item and prerequisite headings', () => {
    const document = empty();
    const requirement = requirementFromCatalog(item);
    document.requirements = [requirement];
    document.steps[0]!.requirements = [
      {
        requirementId: requirement.id,
        quantity: 1,
        unit: 'each',
        mode: 'reuse',
        optional: false,
        notes: '',
      },
    ];
    render(
      <>
        <h1>Guide editor</h1>
        <Harness initial={document} stepId={id(11)} />
      </>,
    );
    expect(screen.getByRole('heading', { name: 'Needed for this step', level: 2 })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Before this step', level: 2 })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Precision driver', level: 3 })).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Earlier steps to complete', level: 3 }),
    ).toBeVisible();
  });
  it('adds a catalog item and step usage atomically with a stable shared reference', () => {
    render(<Harness initial={empty()} stepId={id(11)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add from catalog' }));
    const result = current();
    expect(result.requirements).toHaveLength(1);
    expect(result.steps[0]?.requirements[0]).toMatchObject({
      requirementId: result.requirements[0]?.id,
      mode: 'reuse',
      quantity: null,
    });
    expect(result.steps[1]?.requirements).toEqual([]);
  });
  it('uses an existing preparation snapshot without refreshing it or duplicating the guide entry', () => {
    const document = empty();
    document.requirements = [requirementFromCatalog(item)];
    mocks.item = { ...item, version: 2, name: 'New catalog name' };
    render(<Harness initial={document} stepId={id(11)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add from catalog' }));
    expect(current().requirements).toHaveLength(1);
    expect(current().requirements[0]?.name).toBe('Precision driver');
    expect(current().requirements[0]?.itemVersion).toBe(1);
  });
  it('asks whether to retain preparation when the final step usage is removed', () => {
    render(<Harness initial={empty()} stepId={id(11)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add from catalog' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Precision driver from this step' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('not assigned to any other step');
    fireEvent.click(screen.getByRole('button', { name: 'Remove from step, keep in preparation' }));
    expect(current().requirements).toHaveLength(1);
    expect(current().steps[0]?.requirements).toEqual([]);
  });
  it('creates warning preconditions and stable earlier-step references', () => {
    render(<Harness initial={empty()} stepId={id(12)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add precondition' }));
    fireEvent.change(screen.getByLabelText('Precondition instruction'), {
      target: { value: 'Check the work surface is clear.' },
    });
    fireEvent.change(screen.getByLabelText('Precondition emphasis'), {
      target: { value: 'warning' },
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Step 1: Step 1' }));
    expect(current().steps[1]?.preconditions[0]).toMatchObject({
      text: 'Check the work surface is clear.',
      tone: 'warning',
    });
    expect(current().steps[1]?.earlierStepIds).toEqual([id(11)]);
  });
  it('shows and repairs a prerequisite broken by reordering', () => {
    const document = empty();
    document.steps[0]!.earlierStepIds = [document.steps[1]!.id];
    render(<Harness initial={document} stepId={id(11)} />);
    expect(screen.getByText(/is now after this step/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Remove invalid prerequisite' }));
    expect(current().steps[0]?.earlierStepIds).toEqual([]);
  });
});
