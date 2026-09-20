'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  Globe2,
  LockKeyhole,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { Button, Dialog } from '@guide/ui';
import { StepRenderer } from '@guide/guide-ui';
import {
  guideDocumentSchema,
  toStructuredDocument,
  getRequirementIssues,
  type GuideStep,
} from '@guide/content';
import type {
  ContentLicense,
  DraftGuide,
  GuidePublicBlocker,
  StudioWorkspace,
} from '@guide/contracts';
import { SessionGate, ErrorNotice } from './frame';
import { MetadataFields } from './pages';
import { newStep, reorder } from './model';
import { RichTextEditor } from './rich-text-editor';
import { StepRequirements } from './step-requirements';
import { StudioError, studioFetch } from './transport';
function fingerprint(guide: DraftGuide) {
  return JSON.stringify({ document: guide.document, categoryId: guide.categoryId });
}

/**
 * Pictures for one step.
 *
 * An upload is held here until it has a description, and only then added to
 * the document. The content schema requires alt text, so attaching first and
 * asking later would mean the author's next save failed for a reason that
 * arrived long after the choice that caused it.
 */
function StepPictures({
  workspaceId,
  step,
  onChange,
}: {
  workspaceId: string;
  step: GuideStep;
  onChange: (step: GuideStep) => void;
}) {
  const [pending, setPending] = useState<{ id: string } | null>(null);
  const [alt, setAlt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      const result = await studioFetch<{ asset: { id: string } }>(
        `/api/studio/${workspaceId}/assets`,
        { method: 'POST', body },
      );
      setPending({ id: result.asset.id });
      setAlt('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That picture could not be added.');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  return (
    <fieldset className="studio-pictures">
      <legend>Pictures</legend>
      {step.media.map((media) => (
        <div className="studio-picture" key={media.assetId}>
          <img src={`/api/media/${workspaceId}/${media.assetId}`} alt={media.alt} />
          <label>
            Description
            <input
              value={media.alt}
              maxLength={500}
              onChange={(e) =>
                onChange({
                  ...step,
                  media: step.media.map((m) =>
                    m.assetId === media.assetId ? { ...m, alt: e.target.value } : m,
                  ),
                })
              }
            />
          </label>
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              onChange({
                ...step,
                media: step.media.filter((m) => m.assetId !== media.assetId),
              })
            }
          >
            Remove
          </Button>
        </div>
      ))}

      {pending ? (
        <div className="studio-picture studio-picture--pending">
          <img src={`/api/media/${workspaceId}/${pending.id}`} alt="" />
          <label>
            Describe this picture
            <input
              autoFocus
              value={alt}
              maxLength={500}
              placeholder="What someone who cannot see it needs to know"
              onChange={(e) => setAlt(e.target.value)}
            />
          </label>
          <Button
            type="button"
            disabled={!alt.trim()}
            onClick={() => {
              onChange({
                ...step,
                media: [...step.media, { assetId: pending.id, alt: alt.trim(), annotations: [] }],
              });
              setPending(null);
              setAlt('');
            }}
          >
            Add to step
          </Button>
          <Button type="button" variant="secondary" onClick={() => setPending(null)}>
            Discard
          </Button>
        </div>
      ) : (
        step.media.length < 10 && (
          <label className="studio-picture-add">
            <span>{busy ? 'Adding\u2026' : 'Add a picture'}</span>
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
              }}
            />
          </label>
        )
      )}
      {error && <ErrorNotice error={error} />}
      <p className="studio-hint">
        JPEG, PNG or WebP, up to 20 MB. Location and camera details are removed, and pictures are
        only visible to people who can already read the guide.
      </p>
    </fieldset>
  );
}

/**
 * Places this guide beneath a broader one.
 *
 * Separate from the category, and deliberately so: a category says what kind
 * of thing the guide is about, while this says it is a narrower case of
 * another guide — a single model under a whole range. Saved on its own, not
 * with the draft, because a family link belongs to the guide rather than to
 * any one version of its text.
 */
/**
 * Moving a guide between the public and internal sections.
 *
 * Going public is checked before it is offered, so an author reads what stands
 * in the way instead of being refused after deciding. Going internal is never
 * blocked, but it is not a recall either, and the wording says so rather than
 * letting someone believe the guide has been unsent.
 */
function GuideSectionPicker({
  workspaceId,
  guideId,
  audience,
  currentRelease,
  onMoved,
}: {
  workspaceId: string;
  guideId: string;
  audience: 'public' | 'members';
  currentRelease: number | null;
  onMoved: (audience: 'public' | 'members') => void;
}) {
  const [blockers, setBlockers] = useState<GuidePublicBlocker[] | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void studioFetch<{ blockers: GuidePublicBlocker[] }>(
      `/api/studio/${workspaceId}/guides/${guideId}/audience`,
    )
      .then((result) => {
        if (active) setBlockers(result.blockers);
      })
      .catch(() => {
        if (active) setBlockers([]);
      });
    return () => {
      active = false;
    };
  }, [workspaceId, guideId, audience]);

  async function move(next: 'public' | 'members') {
    setBusy(true);
    setError('');
    setSaved('');
    try {
      await studioFetch(`/api/studio/${workspaceId}/guides/${guideId}/audience`, {
        method: 'PUT',
        body: JSON.stringify({ audience: next, expectedRelease: currentRelease }),
      });
      onMoved(next);
      setSaved(
        next === 'public'
          ? 'Moved. The published version is now in the public library.'
          : 'Moved. This guide is no longer served publicly.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That move could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  const describe = (blocker: GuidePublicBlocker) =>
    blocker.kind === 'workspace'
      ? `${blocker.name} is a private workspace, so it has no public section.`
      : blocker.kind === 'category'
        ? `It is published under ${blocker.name}, a members-only category.`
        : `The published version uses ${blocker.name}, a members-only catalog item.`;

  return (
    <div className="studio-section-move">
      <h3>Section</h3>
      <p className="studio-hint">
        {audience === 'public'
          ? 'Anyone can read the published version of this guide.'
          : 'Only members of this workspace can read this guide.'}
      </p>
      {audience === 'members' ? (
        blockers === null ? (
          <p className="studio-hint">Checking what this guide depends on…</p>
        ) : blockers.length ? (
          <div className="studio-blockers">
            <p>This guide cannot move to the public section yet:</p>
            <ul>
              {blockers.map((blocker) => (
                <li key={`${blocker.kind}:${blocker.name}`}>{describe(blocker)}</li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <p className="studio-hint">
              Moving it out makes the published version readable by anyone, and lists it in the
              public library.
            </p>
            <Button variant="secondary" disabled={busy} onClick={() => void move('public')}>
              <Globe2 size={16} />
              Move to the public section
            </Button>
          </>
        )
      ) : (
        <>
          <p className="studio-hint">
            Moving it in stops it being served publicly straight away. It does not reach copies
            people have already saved, printed or indexed, and any licence it was published under
            still applies to those.
          </p>
          <Button variant="secondary" disabled={busy} onClick={() => void move('members')}>
            <LockKeyhole size={16} />
            Move to the internal section
          </Button>
        </>
      )}
      {saved && <p className="studio-success">{saved}</p>}
      {error && <ErrorNotice error={error} />}
    </div>
  );
}
function GuideFamilyPicker({ workspaceId, guideId }: { workspaceId: string; guideId: string }) {
  const [candidates, setCandidates] = useState<{ id: string; title: string }[]>([]);
  const [parentId, setParentId] = useState('');
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void Promise.all([
      studioFetch<{ guides: { id: string; title: string }[] }>(`/api/studio/${workspaceId}/guides`),
      studioFetch<{ family: { ancestors: { id: string }[] } }>(
        `/api/studio/${workspaceId}/guides/${guideId}/family`,
      ),
    ])
      .then(([list, family]) => {
        if (!active) return;
        setCandidates(list.guides.filter((g) => g.id !== guideId));
        const ancestors = family.family.ancestors;
        setParentId(ancestors.length ? ancestors[ancestors.length - 1]!.id : '');
      })
      .catch(() => {
        if (active) setCandidates([]);
      });
    return () => {
      active = false;
    };
  }, [workspaceId, guideId]);

  async function save(next: string) {
    setBusy(true);
    setError('');
    setSaved('');
    try {
      await studioFetch(`/api/studio/${workspaceId}/guides/${guideId}/family`, {
        method: 'PUT',
        body: JSON.stringify({ parentGuideId: next || null, sortOrder: 0 }),
      });
      setParentId(next);
      setSaved(
        next
          ? 'Saved. This guide now sits beneath that one.'
          : 'Saved. This guide stands on its own.',
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That relationship could not be saved.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="studio-family">
      <label>
        Part of a broader guide
        <select
          value={parentId}
          disabled={busy}
          onChange={(event) => void save(event.target.value)}
        >
          <option value="">Not part of one</option>
          {candidates.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.title}
            </option>
          ))}
        </select>
      </label>
      <p className="studio-hint">
        For a range and its models: readers of the broader guide can narrow to this one, and readers
        here can step back up. Separate from its category.
      </p>
      {saved && <p className="studio-success">{saved}</p>}
      {error && <ErrorNotice error={error} />}
    </div>
  );
}
export function EditorPage({ workspaceId, guideId }: { workspaceId: string; guideId: string }) {
  return (
    <SessionGate workspaceId={workspaceId}>
      {(_, workspace) => <Editor workspace={workspace!} guideId={guideId} />}
    </SessionGate>
  );
}
function Editor({ workspace, guideId }: { workspace: StudioWorkspace; guideId: string }) {
  const [guide, setGuide] = useState<DraftGuide>();
  const [baseline, setBaseline] = useState('');
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [pending, setPending] = useState<'save' | 'publish' | null>(null);
  const [selected, setSelected] = useState('');
  const [preview, setPreview] = useState(false);
  const [metadata, setMetadata] = useState(false);
  const [license, setLicense] = useState<ContentLicense | ''>('');
  const [releaseUrl, setReleaseUrl] = useState('');
  const [publishOpen, setPublishOpen] = useState(false);
  const publishedLink = useRef<HTMLAnchorElement>(null);
  const focusPublishedLink = useRef(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [retry, setRetry] = useState(0);
  const [editorDrafts, setEditorDrafts] = useState<Record<string, unknown>>({});
  const [editorErrors, setEditorErrors] = useState<Record<string, string | null>>({});
  const saving = useRef(false);
  const invalidContent = guide?.document.steps.some((step) => !!editorErrors[step.id]) ?? false;
  const dirty = !!guide && (fingerprint(guide) !== baseline || invalidContent);
  const recovery = guide ? { ...guide, unsavedEditorDocuments: editorDrafts } : undefined;
  const endpoint = `/api/studio/${workspace.id}/guides/${guideId}`;
  useEffect(() => {
    let active = true;
    studioFetch<{ guide: DraftGuide }>(endpoint)
      .then(({ guide: loaded }) => {
        if (active) {
          const editable = { ...loaded, document: toStructuredDocument(loaded.document) };
          setGuide(editable);
          setBaseline(fingerprint(editable));
          setEditorDrafts({});
          setEditorErrors({});
          setSelected(loaded.document.steps[0]!.id);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [endpoint, retry]);
  useEffect(() => {
    if (!dirty && !pending) return;
    function leave(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    function navigate(event: MouseEvent) {
      const link = (event.target as Element).closest?.('a[href]');
      if (link?.closest('[contenteditable="true"]')) return;
      if (
        link &&
        !(link as HTMLAnchorElement).hash &&
        !window.confirm('You have unsaved changes. Leave this page and discard them?')
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    window.addEventListener('beforeunload', leave);
    document.addEventListener('click', navigate, true);
    return () => {
      window.removeEventListener('beforeunload', leave);
      document.removeEventListener('click', navigate, true);
    };
  }, [dirty, pending]);
  function problem(e: unknown) {
    setError(e instanceof Error ? e.message : 'The request failed. Your input is still here.');
    if (e instanceof StudioError) {
      if (e.status === 409) setConflict(true);
      if (e.status === 401)
        setError('Your session expired. Copy your work below before signing in again.');
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!guide || saving.current || invalidContent) return;
    const parsed = guideDocumentSchema.safeParse({
      ...guide.document,
      tools: guide.document.tools.map((tool) => tool.trim()).filter(Boolean),
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · '));
      return;
    }
    if (!guide.categoryId) {
      setError('Choose a category before saving.');
      return;
    }
    saving.current = true;
    setPending('save');
    setError('');
    const snapshot = guide;
    try {
      const { guide: stored } = await studioFetch<{ guide: DraftGuide }>(endpoint, {
        method: 'PUT',
        body: JSON.stringify({
          document: parsed.data,
          categoryId: snapshot.categoryId,
          expectedVersion: snapshot.version,
        }),
      });
      setBaseline(fingerprint(stored));
      setReleaseUrl('');
      setGuide((latest) =>
        latest && fingerprint(latest) !== fingerprint(snapshot)
          ? {
              ...latest,
              version: stored.version,
              currentRelease: stored.currentRelease,
              publishedVersion: stored.publishedVersion,
              updatedAt: stored.updatedAt,
            }
          : stored,
      );
      setConflict(false);
    } catch (e) {
      problem(e);
    } finally {
      saving.current = false;
      setPending(null);
    }
  }
  function updateStep(next: GuideStep) {
    setGuide((value) =>
      value
        ? {
            ...value,
            document: {
              ...toStructuredDocument(value.document),
              steps: toStructuredDocument(value.document).steps.map((step) =>
                step.id === next.id ? { ...step, ...next } : step,
              ),
            },
          }
        : value,
    );
  }
  function changeSteps(steps: GuideStep[]) {
    setGuide((value) =>
      value
        ? {
            ...value,
            document: {
              ...toStructuredDocument(value.document),
              steps: steps.map((item) => ({
                ...item,
                requirements: item.requirements ?? [],
                preconditions: item.preconditions ?? [],
                earlierStepIds: item.earlierStepIds ?? [],
              })),
            },
          }
        : value,
    );
  }
  async function publish() {
    if (!guide || saving.current || dirty || (!license && guide.audience === 'public')) return;
    saving.current = true;
    setPending('publish');
    setError('');
    try {
      const result = await studioFetch<{ guide: { release: number }; url: string }>(
        `${endpoint}/publish`,
        {
          method: 'POST',
          body: JSON.stringify({
            expectedVersion: guide.version,
            expectedRelease: guide.currentRelease,
            license: guide.audience === 'members' ? 'all-rights-reserved' : license,
          }),
        },
      );
      setGuide((latest) =>
        latest
          ? { ...latest, currentRelease: result.guide.release, publishedVersion: guide.version }
          : latest,
      );
      setReleaseUrl(result.url);
      focusPublishedLink.current = true;
      setPublishOpen(false);
    } catch (e) {
      problem(e);
    } finally {
      saving.current = false;
      setPending(null);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(recovery, null, 2));
      setCopyStatus('Draft copied. Keep it somewhere safe before reloading.');
    } catch {
      setCopyStatus('Clipboard unavailable. Select and copy the recovery text below.');
    }
  }
  if (!guide)
    return (
      <main id="main" tabIndex={-1} className="studio-container">
        {error ? (
          <>
            <ErrorNotice error={error} />
            <Button
              onClick={() => {
                setError('');
                setRetry(retry + 1);
              }}
            >
              Try again
            </Button>
          </>
        ) : (
          <p role="status">Opening your draft…</p>
        )}
      </main>
    );
  const requirementIssues = getRequirementIssues(guide.document);
  const steps = guide.document.steps;
  const index = steps.findIndex((step) => step.id === selected);
  const step = steps[index] || steps[0]!;
  const changedRelease =
    guide.currentRelease && (dirty || guide.publishedVersion !== guide.version);
  return (
    <main id="main" tabIndex={-1} className="studio-editor">
      <form onSubmit={save}>
        <header className="studio-editor-header">
          <div>
            <a className="studio-eyebrow" href={`/studio/${workspace.id}`}>
              {workspace.name} / Guides
            </a>
            <h1>{guide.document.title || 'Untitled guide'}</h1>
            <div className="studio-inline">
              <span className="studio-badge">
                {guide.audience === 'public' ? 'Public on publication' : 'Members only'}
              </span>
              <span role="status">
                {pending === 'save'
                  ? 'Saving…'
                  : conflict
                    ? 'Save conflict'
                    : dirty
                      ? 'Unsaved changes'
                      : 'All changes saved'}
              </span>
              <span className="studio-hint">
                Draft v{guide.version}
                {guide.currentRelease
                  ? ` · Release ${guide.currentRelease}${changedRelease ? ' · Unpublished changes' : ' · Up to date'}`
                  : ' · Not published'}
              </span>
            </div>
          </div>
          <div className="studio-actions">
            <Button
              variant="secondary"
              onClick={() => setPreview(!preview)}
              aria-pressed={preview}
              disabled={!preview && invalidContent}
            >
              <Eye size={17} />
              {preview ? 'Edit step' : 'Preview'}
            </Button>
            <Button
              type="submit"
              disabled={!dirty || conflict || !!pending || invalidContent}
              loading={pending === 'save'}
            >
              <Save size={17} />
              Save draft
            </Button>
            {guide.currentRelease && (
              <a
                className="studio-text-link"
                href={
                  guide.audience === 'public' && workspace.id === 'repair-collective'
                    ? `/guides/${guide.id}`
                    : `/w/${workspace.id}/guides/${guide.id}`
                }
              >
                Read release {guide.currentRelease}
              </a>
            )}
            <Dialog
              open={publishOpen}
              closeDisabled={pending === 'publish'}
              onOpenChange={(open) => {
                if (pending !== 'publish') setPublishOpen(open);
              }}
              onCloseAutoFocus={(event) => {
                if (focusPublishedLink.current) {
                  event.preventDefault();
                  publishedLink.current?.focus();
                  focusPublishedLink.current = false;
                }
              }}
              trigger={
                <Button
                  variant="secondary"
                  disabled={
                    dirty ||
                    !!pending ||
                    conflict ||
                    requirementIssues.length > 0 ||
                    guide.publishedVersion === guide.version
                  }
                >
                  Publish…
                </Button>
              }
              title="Publish this release?"
              description={
                guide.audience === 'public'
                  ? 'This creates a readable public release. Anyone with the link can read it.'
                  : 'This creates a release visible only to active members of this workspace.'
              }
            >
              <div className="studio studio-publish">
                <p>
                  <strong>{guide.document.title}</strong> · Draft v{guide.version} · {steps.length}{' '}
                  steps
                </p>
                <p>The published snapshot stays unchanged when you edit the next draft.</p>
                {guide.audience === 'public' ? (
                  <label>
                    Content license
                    <select
                      value={license}
                      onChange={(e) => setLicense(e.target.value as ContentLicense | '')}
                    >
                      <option value="">Choose a license explicitly</option>
                      <option value="all-rights-reserved">All rights reserved</option>
                      <option value="CC-BY-4.0">Creative Commons Attribution 4.0</option>
                      <option value="CC-BY-SA-4.0">
                        Creative Commons Attribution-ShareAlike 4.0
                      </option>
                    </select>
                  </label>
                ) : (
                  <p>Private content uses all rights reserved.</p>
                )}
                <Button
                  onClick={() => void publish()}
                  loading={pending === 'publish'}
                  disabled={dirty || conflict || (guide.audience === 'public' && !license)}
                >
                  Confirm publication
                </Button>
                {error && <ErrorNotice error={error} />}
              </div>
            </Dialog>
          </div>
        </header>
        {dirty && (
          <p className="studio-save-hint">
            Save your changes before publishing. Saving does not publish.
          </p>
        )}
        {invalidContent && (
          <div className="studio-notice" role="alert">
            Fix the instructions in{' '}
            {guide.document.steps
              .filter((item) => editorErrors[item.id])
              .map((item) => item.title)
              .join(', ')}{' '}
            before saving or publishing. Your edits are retained while switching steps.
          </div>
        )}
        {(error || invalidContent) && (
          <div className="studio-error-area">
            {error && <ErrorNotice error={error} />}
            <div className="studio-actions">
              <Button variant="secondary" onClick={() => void copy()}>
                <Copy size={16} />
                Copy recovery draft
              </Button>
              <a
                href={`/sign-in?returnTo=${encodeURIComponent(`/studio/${workspace.id}/${guideId}`)}`}
                target="_blank"
                rel="noreferrer"
              >
                Sign in in a new tab
              </a>
              {conflict && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    if (
                      window.confirm(
                        'Reload the saved draft? Copy your recovery draft first; this discards your current edits.',
                      )
                    ) {
                      setError('');
                      setConflict(false);
                      setRetry(retry + 1);
                    }
                  }}
                >
                  Reload saved draft
                </Button>
              )}
            </div>
            <p role="status">{copyStatus}</p>
            <details>
              <summary>Show recovery text</summary>
              <textarea
                readOnly
                aria-label="Recovery draft JSON"
                value={JSON.stringify(recovery, null, 2)}
                rows={6}
              />
            </details>
          </div>
        )}
        {releaseUrl && (
          <div className="studio-notice" role="status">
            Release published.{' '}
            <a ref={publishedLink} className="studio-text-link" href={releaseUrl}>
              Read published guide
            </a>
          </div>
        )}
        {requirementIssues.length > 0 && (
          <div
            className="studio-notice"
            role="region"
            aria-label="Requirements to resolve before publishing"
          >
            <strong>Before publishing</strong>
            <p>You can save your draft while you resolve these details.</p>
            <ul>
              {requirementIssues.map((issue, issueIndex) => (
                <li key={issueIndex}>
                  <button
                    type="button"
                    className="studio-issue-link"
                    onClick={() => {
                      const stepIndex =
                        issue.path[0] === 'steps' && typeof issue.path[1] === 'number'
                          ? issue.path[1]
                          : null;
                      if (stepIndex !== null && steps[stepIndex]) {
                        setSelected(steps[stepIndex].id);
                        setMetadata(false);
                        setPreview(false);
                      } else {
                        setMetadata(true);
                      }
                    }}
                  >
                    {issue.message}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="studio-editor-grid">
          <aside className="studio-outline">
            <button
              type="button"
              className={metadata ? 'studio-outline-item selected' : 'studio-outline-item'}
              onClick={() => setMetadata(true)}
              aria-current={metadata ? 'step' : undefined}
            >
              <span>—</span>
              <strong>Guide details</strong>
            </button>
            <div className="studio-outline-heading">
              <span className="studio-eyebrow">Steps</span>
              <span>{steps.length} / 100</span>
            </div>
            <ol>
              {steps.map((item, i) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={
                      !metadata && step.id === item.id
                        ? 'studio-outline-item selected'
                        : 'studio-outline-item'
                    }
                    aria-current={!metadata && step.id === item.id ? 'step' : undefined}
                    onClick={() => {
                      setSelected(item.id);
                      setMetadata(false);
                    }}
                  >
                    <span>{String(i + 1).padStart(2, '0')}</span>
                    <strong>{item.title || 'Untitled step'}</strong>
                  </button>
                </li>
              ))}
            </ol>
            <Button
              variant="secondary"
              disabled={steps.length >= 100 || pending === 'publish'}
              onClick={() => {
                const added = newStep();
                changeSteps([...steps, added]);
                setSelected(added.id);
                setMetadata(false);
              }}
            >
              <Plus size={17} />
              Add step
            </Button>
            <p className="studio-hint">Changes stay in this tab until you save.</p>
          </aside>
          <section className="studio-editor-canvas">
            {metadata ? (
              <>
                <span className="studio-eyebrow">The essentials</span>
                <h2>Guide details</h2>
                <MetadataFields
                  audience={guide.audience}
                  document={guide.document}
                  workspace={workspace}
                  category={guide.categoryId}
                  onDocument={(document) =>
                    setGuide((current) => (current ? { ...current, document } : current))
                  }
                  onCategory={(categoryId) =>
                    setGuide((current) =>
                      current ? { ...current, categoryId: categoryId ?? '' } : current,
                    )
                  }
                />
                <GuideFamilyPicker workspaceId={guide.workspaceId} guideId={guide.id} />
                <GuideSectionPicker
                  workspaceId={guide.workspaceId}
                  guideId={guide.id}
                  audience={guide.audience}
                  currentRelease={guide.currentRelease}
                  onMoved={(audience) =>
                    setGuide((current) => (current ? { ...current, audience } : current))
                  }
                />
              </>
            ) : preview ? (
              <div className="studio-live-preview">
                <span className="studio-eyebrow">Reader preview · Step {index + 1}</span>
                <StepRenderer
                  document={guide.document}
                  step={step}
                  index={index}
                  mediaSrc={(assetId) => `/api/media/${guide.workspaceId}/${assetId}`}
                />
              </div>
            ) : (
              <>
                <div className="studio-step-topline">
                  <span className="studio-eyebrow">
                    Step {index + 1} of {steps.length}
                  </span>
                  <div className="studio-step-tools">
                    <Button
                      variant="ghost"
                      disabled={index <= 0}
                      onClick={() => changeSteps(reorder(steps, step.id, -1))}
                    >
                      <ArrowUp size={16} />
                      Move up
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={index >= steps.length - 1}
                      onClick={() => changeSteps(reorder(steps, step.id, 1))}
                    >
                      <ArrowDown size={16} />
                      Move down
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={steps.length >= 100}
                      onClick={() => {
                        const duplicate = {
                          ...structuredClone(step),
                          id: crypto.randomUUID(),
                          title: step.title.slice(0, 151) + ' (copy)',
                        };
                        const next = [...steps];
                        next.splice(index + 1, 0, duplicate);
                        changeSteps(next);
                        if (editorDrafts[step.id] !== undefined)
                          setEditorDrafts((previous) => ({
                            ...previous,
                            [duplicate.id]: previous[step.id]!,
                          }));
                        if (editorErrors[step.id])
                          setEditorErrors((previous) => ({
                            ...previous,
                            [duplicate.id]: previous[step.id]!,
                          }));
                        setSelected(duplicate.id);
                      }}
                    >
                      <Copy size={16} />
                      Duplicate
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={steps.length <= 1}
                      onClick={() => {
                        const dependents = steps.filter((item) =>
                          (item as GuideStep).earlierStepIds?.includes(step.id),
                        );
                        if (dependents.length) {
                          setError(
                            `This step is a prerequisite for ${dependents.map((item) => `“${item.title}”`).join(', ')}. Remove those prerequisites before deleting it.`,
                          );
                          return;
                        }
                        if (window.confirm(`Remove “${step.title}”? This cannot be undone.`)) {
                          changeSteps(steps.filter((item) => item.id !== step.id));
                          setSelected(steps[index === 0 ? 1 : index - 1]!.id);
                        }
                      }}
                    >
                      <Trash2 size={16} />
                      Remove
                    </Button>
                  </div>
                </div>
                <div className="studio-form studio-step-form">
                  <label className="studio-step-title">
                    Step title
                    <input
                      maxLength={160}
                      required
                      value={step.title}
                      onChange={(e) => updateStep({ ...step, title: e.target.value })}
                    />
                  </label>
                  <RichTextEditor
                    key={step.id}
                    value={step.body}
                    draft={editorDrafts[step.id]}
                    onDraftChange={(draft) =>
                      setEditorDrafts((previous) => ({ ...previous, [step.id]: draft }))
                    }
                    onChange={(body) => updateStep({ ...step, body })}
                    onValidityChange={(message) =>
                      setEditorErrors((previous) =>
                        previous[step.id] === message
                          ? previous
                          : { ...previous, [step.id]: message },
                      )
                    }
                  />
                  <StepPictures workspaceId={guide.workspaceId} step={step} onChange={updateStep} />
                </div>
                {guide.document.schemaVersion === 4 && (
                  <StepRequirements
                    audience={guide.audience}
                    document={guide.document}
                    stepId={step.id}
                    workspace={workspace}
                    onChange={(document) =>
                      setGuide((current) => (current ? { ...current, document } : current))
                    }
                    disabled={pending === 'publish'}
                  />
                )}
                {step.callouts.length > 0 && (
                  <div className="studio-notice">
                    This step has {step.callouts.length} existing note(s). They are preserved and
                    shown in Preview.
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </form>
    </main>
  );
}
