'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Globe2, LockKeyhole, Plus, Search } from 'lucide-react';
import { Button } from '@guide/ui';
import type { DraftGuide, DraftSummary, StudioWorkspace } from '@guide/contracts';
import type { GuideDocument } from '@guide/content';
import { Frame, ErrorNotice, SessionGate } from './frame';
import { studioFetch, StudioError } from './transport';
import { newDocument, safeReturnTo } from './model';
import { CategoryPicker } from '../structured';
import { GuideRequirements } from './guide-requirements';
export function SignIn() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const fields = new FormData(event.currentTarget);
    setPending(true);
    setError('');
    try {
      await studioFetch('/api/auth/sign-in/email', {
        method: 'POST',
        body: JSON.stringify({ email: fields.get('email'), password: fields.get('password') }),
      });
      window.location.assign(
        safeReturnTo(new URLSearchParams(window.location.search).get('returnTo')),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed.');
      setPending(false);
    }
  }
  return (
    <Frame>
      <main id="main" tabIndex={-1} className="studio-signin">
        <section className="studio-intro">
          <span className="studio-eyebrow">A place for practical knowledge</span>
          <h1>Make the next step clear.</h1>
          <p>
            Write a useful guide, refine the details, and share a release with the people who need
            it.
          </p>
          <div className="studio-intro-note">
            <PenNote /> Your work stays a draft until you choose to publish.
          </div>
        </section>
        <form className="studio-card studio-form" onSubmit={submit}>
          <span className="studio-eyebrow">Welcome back</span>
          <h2>Sign in to your studio</h2>
          <p>Use the verified local account provided by your operator.</p>
          <label>
            Email
            <input name="email" type="email" autoComplete="username" required autoFocus />
          </label>
          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>
          {error && <ErrorNotice error={error} />}
          <Button type="submit" loading={pending}>
            Sign in <ArrowRight size={17} />
          </Button>
          <p className="studio-hint">
            This local preview has no open registration or password reset. Account details and setup
            instructions are in LOCAL_ACCESS.md.
          </p>
        </form>
      </main>
    </Frame>
  );
}
function PenNote() {
  return <span aria-hidden="true">01 /</span>;
}
export function Workspaces() {
  return (
    <SessionGate>
      {(session) => (
        <main id="main" tabIndex={-1} className="studio-container">
          <div className="studio-page-heading">
            <span className="studio-eyebrow">Your studio</span>
            <h1>Where will you create?</h1>
            <p>Choose a workspace to continue a draft or start something useful.</p>
          </div>
          <div className="studio-workspaces">
            {session.workspaces.map((workspace) => (
              <a
                className="studio-card studio-workspace"
                key={workspace.id}
                href={`/studio/${workspace.id}`}
              >
                <span className="studio-workspace-icon">
                  {workspace.audience === 'public' ? <Globe2 /> : <LockKeyhole />}
                </span>
                <span className="studio-eyebrow">
                  {workspace.audience === 'public' ? 'Public community' : 'Private workspace'} ·{' '}
                  {workspace.role}
                </span>
                <h2>{workspace.name}</h2>
                <p>
                  {workspace.role === 'owner'
                    ? 'Create, edit and publish your guides.'
                    : 'Browse the published workspace library. Authoring is currently owner-only.'}
                </p>
                <span className="studio-text-link">
                  Open workspace <ArrowRight size={17} />
                </span>
              </a>
            ))}
          </div>
          {!session.workspaces.length && (
            <div className="studio-card">
              <h2>No workspaces yet</h2>
              <p>Ask your local operator to assign workspace access.</p>
            </div>
          )}
        </main>
      )}
    </SessionGate>
  );
}
export function WorkspacePage({ workspaceId }: { workspaceId: string }) {
  return (
    <SessionGate workspaceId={workspaceId}>
      {(_, workspace) => <GuideList workspace={workspace!} />}
    </SessionGate>
  );
}
function GuideList({ workspace }: { workspace: StudioWorkspace }) {
  const [guides, setGuides] = useState<DraftSummary[]>();
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (workspace.role !== 'owner') return;
    let active = true;
    studioFetch<{ guides: DraftSummary[] }>(`/api/studio/${workspace.id}/guides`)
      .then((data) => {
        if (active) setGuides(data.guides);
      })
      .catch((e) => {
        if (active) {
          if (e instanceof StudioError && e.status === 401) {
            window.location.assign(
              `/sign-in?returnTo=${encodeURIComponent(window.location.pathname)}`,
            );
            return;
          }
          setError(e.message);
        }
      });
    return () => {
      active = false;
    };
  }, [workspace, attempt]);
  const filtered = guides?.filter(
    (guide) =>
      `${guide.title} ${guide.summary} ${guide.category}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (status === 'all' ||
        (status === 'published' ? guide.currentRelease !== null : guide.currentRelease === null)),
  );
  return (
    <main id="main" tabIndex={-1} className="studio-container">
      <div className="studio-heading-row">
        <div className="studio-page-heading">
          <a className="studio-eyebrow" href="/studio">
            Studio / {workspace.name}
          </a>
          <h1>Your guides</h1>
          <p>Good instructions start with a first draft.</p>
        </div>
        {workspace.role === 'owner' && (
          <a className="button button--primary" href={`/studio/${workspace.id}/new`}>
            <Plus size={18} /> New guide
          </a>
        )}
      </div>
      {workspace.role !== 'owner' ? (
        <div className="studio-card">
          <h2>Explore your workspace</h2>
          <p>Authoring is currently available to workspace owners.</p>
          <a
            className="button button--primary"
            href={workspace.audience === 'private' ? `/w/${workspace.id}` : '/'}
          >
            Open library
          </a>
        </div>
      ) : (
        <>
          <div className="studio-filters">
            <label className="studio-search">
              <Search size={18} />
              <span className="sr-only">Filter guides</span>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find a guide by title, topic or summary"
              />
            </label>
            <label>
              <span className="sr-only">Publication status</span>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="all">All guides</option>
                <option value="draft">Drafts</option>
                <option value="published">Published</option>
              </select>
            </label>
          </div>
          {error ? (
            <>
              <ErrorNotice error={error} />
              <Button
                onClick={() => {
                  setError('');
                  setAttempt(attempt + 1);
                }}
              >
                Try again
              </Button>
            </>
          ) : !guides ? (
            <p role="status">Loading guides…</p>
          ) : (
            <>
              <p className="studio-hint" role="status">
                {filtered!.length} {filtered!.length === 1 ? 'guide' : 'guides'}
              </p>
              <div className="studio-guide-list">
                {filtered!.map((guide) => (
                  <a
                    className="studio-guide-row"
                    key={guide.id}
                    href={`/studio/${workspace.id}/${guide.id}`}
                  >
                    <div>
                      <span className="studio-eyebrow">
                        {guide.category} · {guide.stepCount} steps
                      </span>
                      <h2>{guide.title}</h2>
                      <p>{guide.summary}</p>
                    </div>
                    <div className="studio-guide-state">
                      <span className="studio-badge">
                        {guide.currentRelease ? `Release ${guide.currentRelease}` : 'Draft'}
                      </span>
                      <small>
                        {guide.currentRelease && guide.publishedVersion !== guide.version
                          ? 'Unpublished changes'
                          : guide.currentRelease
                            ? 'Published'
                            : 'Not yet published'}
                      </small>
                      <ArrowRight size={20} />
                    </div>
                  </a>
                ))}
              </div>
              {!filtered!.length && (
                <div className="studio-empty">
                  <h2>{guides.length ? 'No matching guides' : 'Room for your first guide'}</h2>
                  <p>
                    {guides.length
                      ? 'Try another word or change the status filter.'
                      : 'Turn what you know into clear, repeatable steps.'}
                  </p>
                  {guides.length ? (
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setSearch('');
                        setStatus('all');
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : (
                    <a className="button button--primary" href={`/studio/${workspace.id}/new`}>
                      Create a guide
                    </a>
                  )}
                </div>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
export function MetadataFields({
  audience,
  document,
  category,
  workspace,
  onDocument,
  onCategory,
}: {
  document: GuideDocument;
  audience?: 'public' | 'members';
  category: string | null;
  workspace: StudioWorkspace;
  onDocument: (document: GuideDocument) => void;
  onCategory: (category: string | null) => void;
}) {
  return (
    <div className="studio-form">
      <label>
        Guide title
        <input
          required
          maxLength={140}
          value={document.title}
          onChange={(e) => onDocument({ ...document, title: e.target.value })}
          placeholder="What will the reader learn?"
        />
      </label>
      <label>
        Summary
        <textarea
          required
          maxLength={500}
          rows={3}
          value={document.summary}
          onChange={(e) => onDocument({ ...document, summary: e.target.value })}
          placeholder="Describe the outcome and who this guide is for."
        />
      </label>
      <div className="studio-field-grid">
        <CategoryPicker
          workspace={workspace}
          domain="guide"
          value={category}
          onChange={onCategory}
          visibility={audience ?? (workspace.audience === 'public' ? 'public' : 'members')}
          required
          label="Category"
        />
        <label>
          Difficulty
          <select
            value={document.difficulty}
            onChange={(e) =>
              onDocument({ ...document, difficulty: e.target.value as GuideDocument['difficulty'] })
            }
          >
            <option value="easy">Easy</option>
            <option value="moderate">Moderate</option>
            <option value="advanced">Advanced</option>
          </select>
        </label>
        <label>
          Time (minutes)
          <input
            type="number"
            min={1}
            max={10080}
            required
            value={document.durationMinutes}
            onChange={(e) => onDocument({ ...document, durationMinutes: Number(e.target.value) })}
          />
        </label>
      </div>
      {document.schemaVersion === 4 && (
        <GuideRequirements
          document={document}
          workspace={workspace}
          audience={audience}
          onChange={onDocument}
        />
      )}
    </div>
  );
}
export function NewGuide({ workspaceId }: { workspaceId: string }) {
  return (
    <SessionGate workspaceId={workspaceId}>
      {(_, workspace) => <CreateGuide workspace={workspace!} />}
    </SessionGate>
  );
}
function CreateGuide({ workspace }: { workspace: StudioWorkspace }) {
  const [document, setDocument] = useState<GuideDocument>();
  const [category, setCategory] = useState<string | null>(null);
  // A private workspace has no public side, so its guides are always internal.
  // A public workspace holds both, and the choice is immutable after creation.
  const [audience, setAudience] = useState<'public' | 'members'>(
    workspace.audience === 'public' ? 'public' : 'members',
  );
  const created = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setDocument(newDocument()), []);
  useEffect(() => {
    if (!document || (!document.title && !document.summary && !category)) return;
    const leave = (event: BeforeUnloadEvent) => {
      if (!created.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [document, category]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending || !document) return;
    if (!category) {
      setError('Choose a category or create one before continuing.');
      return;
    }
    setPending(true);
    setError('');
    try {
      const data = await studioFetch<{ guide: DraftGuide }>(`/api/studio/${workspace.id}/guides`, {
        method: 'POST',
        body: JSON.stringify({
          document: {
            ...document,
            tools: document.tools.map((tool) => tool.trim()).filter(Boolean),
          },
          categoryId: category,
          audience,
        }),
      });
      created.current = true;
      window.location.assign(`/studio/${workspace.id}/${data.guide.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to create guide.');
      setPending(false);
    }
  }
  return (
    <main id="main" tabIndex={-1} className="studio-container studio-narrow">
      <div className="studio-page-heading">
        <a className="studio-eyebrow" href={`/studio/${workspace.id}`}>
          {workspace.name} / New guide
        </a>
        <h1>Start with the essentials.</h1>
        <p>You can refine everything as you write. Nothing is published yet.</p>
      </div>
      {workspace.role !== 'owner' ? (
        <ErrorNotice error="Only workspace owners can create guides in this preview." />
      ) : (
        document && (
          <form className="studio-card" onSubmit={submit}>
            <MetadataFields
              document={document}
              workspace={workspace}
              category={category}
              onDocument={setDocument}
              onCategory={setCategory}
            />
            {workspace.audience === 'public' ? (
              <fieldset className="studio-fieldset">
                <legend>Section</legend>
                <p className="studio-hint">
                  Chosen once. A guide cannot move between sections after it is created.
                </p>
                <label className="studio-choice">
                  <input
                    type="radio"
                    name="audience"
                    value="public"
                    checked={audience === 'public'}
                    onChange={() => setAudience('public')}
                  />
                  <span>
                    <strong>Public</strong>
                    Anyone can read it once published.
                  </span>
                </label>
                <label className="studio-choice">
                  <input
                    type="radio"
                    name="audience"
                    value="members"
                    checked={audience === 'members'}
                    onChange={() => setAudience('members')}
                  />
                  <span>
                    <strong>Internal</strong>
                    Only active members of this workspace can read it.
                  </span>
                </label>
              </fieldset>
            ) : (
              <p className="studio-notice">
                Private workspace: published guides are only visible to active workspace members.
              </p>
            )}
            {error && <ErrorNotice error={error} />}
            <div className="studio-actions">
              <a href={`/studio/${workspace.id}`}>Cancel</a>
              <Button type="submit" loading={pending}>
                Create draft <ArrowRight size={17} />
              </Button>
            </div>
          </form>
        )
      )}
    </main>
  );
}
