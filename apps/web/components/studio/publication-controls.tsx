'use client';
import { useEffect, useRef, useState } from 'react';
import type { DraftGuide, GuideReinstateBlocker } from '@guide/contracts';
import { Button, Dialog } from '@guide/ui';
import { ErrorNotice } from './frame';
import { studioFetch, StudioError } from './transport';
import * as X from './studio-styles';
export function PublicationControls({
  guide,
  busy,
  onChanged,
  onBusy,
}: {
  guide: DraftGuide;
  busy: boolean;
  onChanged: (guide: DraftGuide) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const [observed, setObserved] = useState<DraftGuide | null>(null);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [blockers, setBlockers] = useState<GuideReinstateBlocker[] | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const trigger = useRef<HTMLDivElement>(null);
  const endpoint = `/api/studio/${guide.workspaceId}/guides/${guide.id}`;
  const withdraw = observed?.state === 'published';
  useEffect(() => {
    let live = true;
    if (observed?.state === 'withdrawn') {
      setBlockers(null);
      studioFetch<{ blockers: GuideReinstateBlocker[] }>(`${endpoint}/reinstate`)
        .then((r) => {
          if (live) setBlockers(r.blockers);
        })
        .catch((e) => {
          if (live) setError(e instanceof Error ? e.message : 'Unable to check this release.');
        });
    }
    return () => {
      live = false;
    };
  }, [observed, endpoint]);
  async function act() {
    if (!observed || pending) return;
    setPending(true);
    onBusy?.(true);
    setError('');
    try {
      const result = await studioFetch<{ guide: DraftGuide }>(
        `${endpoint}/${withdraw ? 'withdraw' : 'reinstate'}`,
        {
          method: 'POST',
          body: JSON.stringify({
            expectedRelease: observed.currentRelease,
            expectedPublicationRevision: observed.publicationRevision,
            ...(withdraw ? { reason } : {}),
          }),
        },
      );
      onChanged(result.guide);
      setStatus(
        withdraw
          ? `Release ${observed.currentRelease} is withdrawn. Readers can no longer open it.`
          : `Release ${observed.currentRelease} is readable again.`,
      );
      setObserved(null);
    } catch (e) {
      if (e instanceof StudioError && e.code === 'PUBLICATION_CHANGED') {
        try {
          const result = await studioFetch<{ guide: DraftGuide }>(endpoint);
          onChanged(result.guide);
          setObserved(null);
          setStatus(e.message);
        } catch (refreshError) {
          setError(
            refreshError instanceof Error
              ? refreshError.message
              : 'Unable to refresh publication state.',
          );
        }
      } else setError(e instanceof Error ? e.message : 'The request failed. Try again.');
    } finally {
      setPending(false);
      onBusy?.(false);
    }
  }
  return (
    <div ref={trigger}>
      {guide.currentRelease && (
        <Dialog
          open={!!observed}
          closeDisabled={pending}
          onOpenChange={(open) => {
            if (!pending) {
              setObserved(open ? guide : null);
              setError('');
              setReason('');
            }
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            trigger.current?.querySelector('button')?.focus();
          }}
          trigger={
            <Button variant="secondary" disabled={busy}>
              {guide.state === 'withdrawn' ? 'Reinstate…' : 'Withdraw…'}
            </Button>
          }
          title={
            withdraw
              ? 'Withdraw this guide?'
              : `Reinstate release ${observed?.currentRelease ?? guide.currentRelease}?`
          }
          description={
            withdraw
              ? `Readers will no longer be able to read release ${observed?.currentRelease}.`
              : `Release ${observed?.currentRelease} becomes readable again, exactly as it was published.`
          }
        >
          <div className={X.form}>
            {withdraw ? (
              <>
                <p>
                  It disappears from the library, search and guide navigation. Pictures used only by
                  this guide stop loading for readers.
                </p>
                <p>
                  Former readers opening its address see a withdrawn notice without the title,
                  instructions or pictures.
                </p>
                <p>
                  The draft and every release are kept. Copies already saved or printed cannot be
                  recalled.
                </p>
                <label>
                  Reason (optional)
                  <textarea
                    maxLength={500}
                    aria-describedby="withdraw-reason-hint"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <p id="withdraw-reason-hint" className={X.hint}>
                  Kept with the record of this withdrawal. Readers never see it.
                </p>
              </>
            ) : (
              <>
                <p>
                  Changes saved to the draft since then are not published. To publish them, choose
                  Publish… instead.
                </p>
                {blockers === null ? (
                  <p>Checking what this release depends on…</p>
                ) : blockers.length > 0 ? (
                  <div className={X.notice}>
                    <p>This release cannot be reinstated:</p>
                    <ul>
                      {blockers.map((b, i) => (
                        <li key={i}>
                          {b.name}: {b.reason}
                        </li>
                      ))}
                    </ul>
                    <p>
                      Resolve these dependencies in the draft and publish a new release instead.
                    </p>
                  </div>
                ) : null}
              </>
            )}
            {error && <ErrorNotice error={error} />}
            <div className={X.actions}>
              <Button
                loading={pending}
                disabled={!withdraw && (blockers === null || blockers.length > 0)}
                onClick={() => void act()}
              >
                {withdraw ? 'Withdraw' : 'Reinstate'} release {observed?.currentRelease}
              </Button>
              <Button variant="secondary" disabled={pending} onClick={() => setObserved(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </Dialog>
      )}
      <p className={X.success} role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
