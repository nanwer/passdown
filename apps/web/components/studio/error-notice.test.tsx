// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { DraftGuide } from '@guide/contracts';
import { ErrorNotice } from './frame';
import { PublicationControls } from './publication-controls';
import { FinishSetup } from '../setup/finish-setup';

const requestId = '7f3a2c1b-9d4e-4f6a-8b1c-2d3e4f5a6b7c';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ErrorNotice', () => {
  it('announces the message and a selectable reference together', () => {
    render(
      <ErrorNotice error={{ message: 'The service is unavailable.', reference: '7f3a2c1b' }} />,
    );
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('The service is unavailable. Reference: 7f3a2c1b');
    const reference = alert.querySelector('code');
    expect(reference).toHaveTextContent(/^7f3a2c1b$/);
    expect(reference).toHaveClass('select-all');
  });

  it('shows a plain message without a reference', () => {
    render(<ErrorNotice error="Check the highlighted fields and try again." />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      /^Check the highlighted fields and try again\.$/,
    );
    expect(screen.queryByText(/Reference/)).not.toBeInTheDocument();
  });
});

describe('a studio surface', () => {
  const guide = {
    id: 'guide',
    workspaceId: 'public',
    state: 'published',
    audience: 'public',
    currentRelease: 1,
    publicationRevision: 4,
  } as DraftGuide;
  async function withdrawAgainst(status: number, body: unknown) {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(body), { status, headers: { 'X-Request-ID': requestId } }),
        ),
    );
    render(<PublicationControls guide={guide} busy={false} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Withdraw release 1' }));
    return screen.findByRole('alert');
  }

  it('shows the reference when withdrawing fails unexpectedly', async () => {
    const alert = await withdrawAgainst(503, {
      error: { code: 'SERVICE_UNAVAILABLE', message: 'The service is unavailable.', requestId },
    });
    expect(alert).toHaveTextContent('The service is unavailable. Reference: 7f3a2c1b');
  });

  it('does not show a reference for a refusal the person can act on', async () => {
    const alert = await withdrawAgainst(409, {
      error: { code: 'CONFLICT', message: 'Someone else changed this guide.', requestId },
    });
    expect(alert).toHaveTextContent(/^Someone else changed this guide\.$/);
  });
});

describe('Finish setting up', () => {
  async function submitAgainst(status: number, body: unknown) {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })),
    );
    render(<FinishSetup />);
    for (const [label, value] of [
      ['Your name', 'Test Owner'],
      ['Your email address', 'owner@example.test'],
      ['New password', 'a long enough password'],
      ['New password again', 'a long enough password'],
      ['Workspace name', 'Test workspace'],
    ] as const)
      fireEvent.change(screen.getByLabelText(label), { target: { value } });
    fireEvent.submit(screen.getByRole('form', { name: 'Finish setting up' }));
    const alert = screen.getByRole('alert', { hidden: true });
    await waitFor(() => expect(alert).not.toHaveAttribute('hidden'));
    return alert;
  }

  it('shows the short reference for a failure on the server’s side', async () => {
    const alert = await submitAgainst(503, {
      error: { code: 'SERVICE_UNAVAILABLE', message: 'The service is unavailable.', requestId },
    });
    expect(alert).toHaveTextContent(/^The service is unavailable\. Reference: 7f3a2c1b$/);
  });

  it('shows no reference for an address someone can change', async () => {
    const alert = await submitAgainst(409, {
      error: { code: 'EMAIL_TAKEN', message: 'That email address is in use.', requestId },
    });
    expect(alert).toHaveTextContent(/^That email address is in use\.$/);
  });
});
