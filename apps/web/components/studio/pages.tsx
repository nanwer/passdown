'use client';
import * as X from './studio-styles';
import { useEffect, useRef, useState, type FormEvent, type Ref } from 'react';
import {
  ArrowRight,
  ArrowLeftRight,
  ClipboardCheck,
  Layers3,
  PackageOpen,
  Wrench,
  Settings2,
  FileText,
  Check,
  Globe2,
  LockKeyhole,
  PenLine,
  Plus,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { Button, ChoiceCard, buttonVariants, cn } from '@guide/ui';
import type { Category, DraftGuide, DraftSummary, StudioWorkspace } from '@guide/contracts';
import { composeGuideTitle, type GuideDocument, type GuideType } from '@guide/content';
import { Frame, ErrorNotice, SessionGate, StudioTrail } from './frame';
import { studioFetch, StudioError } from './transport';
import { newDocument, safeReturnTo } from './model';
import { CategoryPicker } from '../structured';
import { words } from '../../lib/vocabulary';
import { GuideRequirements } from './guide-requirements';
import { AuthoringSection, authoringPanel } from './authoring-section';
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
      <main
        id="main"
        tabIndex={-1}
        className="mx-auto my-auto grid min-h-[78vh] max-w-[1200px] grid-cols-[1.1fr_1fr] items-center gap-20 px-8 py-22.5 max-[1000px]:gap-[35px] max-[700px]:grid-cols-[1fr] max-[700px]:gap-8 max-[700px]:px-5 max-[700px]:py-10"
      >
        <section className="[&_h1]:mx-0 [&_h1]:my-6 [&_h1]:max-w-[500px] [&_h1]:text-[clamp(42px,5vw,66px)] [&_h1]:leading-[1.04] max-[700px]:[&_h1]:text-[42px] [&>p]:max-w-[450px] [&>p]:text-[18px]">
          <span className={X.eyebrow}>A place for practical knowledge</span>
          <h1>Make the next step clear.</h1>
          <p>
            Write a useful guide, refine the details, and share a release with the people who need
            it.
          </p>
          <div className="mt-15 flex gap-4.5 border-t border-solid border-t-control pt-5.5 text-muted max-[700px]:mt-6 [&_span]:font-[monospace] [&_span]:text-action">
            <PenNote /> Your work stays a draft until you choose to publish.
          </div>
        </section>
        <form className={cn(X.card, X.form)} onSubmit={submit}>
          <span className={X.eyebrow}>Welcome back</span>
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
          <p className={X.hint}>
            Forgot your password? Ask an administrator of this installation for a reset link.
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
        <main id="main" tabIndex={-1} className={X.container}>
          <div className={X.pageHeading}>
            <span className={X.eyebrow}>Your studio</span>
            <h1>Where will you create?</h1>
            <p>Choose a workspace to continue a draft or start something useful.</p>
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,310px),1fr))] gap-6">
            {session.workspaces.map((workspace) => (
              /* Not a single link any more. The card used to be one <a>, which
                 meant the only thing you could do from here was enter the
                 workspace and go looking — People in particular is somewhere you
                 head for deliberately, and there was no way to reach it without
                 first knowing it existed. Nothing can nest inside a link, so the
                 card is a region with several. */
              <div
                className={cn(
                  X.card,
                  'studio-workspace flex flex-col gap-3.5 [transition:border-color_0.15s] hover:border-action',
                )}
                key={workspace.id}
              >
                <span className="mb-3.5 grid size-13 place-items-center rounded-[12px] bg-accent-surface text-accent-ink">
                  {workspace.audience === 'public' ? <Globe2 /> : <LockKeyhole />}
                </span>
                <span className={X.eyebrow}>
                  {workspace.audience === 'public' ? 'Public community' : 'Private workspace'} ·{' '}
                  {workspace.role === 'manage' ? 'you manage this' : 'you can read this'}
                </span>
                <h2>
                  <a href={`/studio/${workspace.id}`}>{workspace.name}</a>
                </h2>
                <p>
                  {workspace.role === 'manage'
                    ? 'Create, edit and publish your guides.'
                    : 'Read what has been published to members here.'}
                </p>
                <a className={cn(X.textLink, 'mt-5')} href={`/studio/${workspace.id}`}>
                  Open workspace <ArrowRight size={17} />
                </a>
                {/* The same two words the header uses. Three shortcuts here and
                    one entry there would be two vocabularies for one structure,
                    which is the fault this work exists to fix. */}
                {workspace.role === 'manage' && (
                  <nav
                    className="mt-4 flex flex-wrap gap-4 border-t border-solid border-t-line pt-3.5 [&_a]:inline-flex [&_a]:items-center [&_a]:gap-1.5 [&_a]:text-[13px] [&_a]:text-muted [&_a:hover]:text-ink"
                    aria-label={`${workspace.name} sections`}
                  >
                    <a href={`/studio/${workspace.id}`}>
                      <PenLine size={15} /> Guides
                    </a>
                    <a href={`/studio/${workspace.id}/manage`}>
                      <SlidersHorizontal size={15} /> Manage
                    </a>
                  </nav>
                )}
              </div>
            ))}
          </div>
          {!session.workspaces.length && (
            <div className={X.card}>
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
    if (workspace.role !== 'manage') return;
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
        (status === 'withdrawn'
          ? guide.state === 'withdrawn'
          : status === 'published'
            ? guide.state === 'published'
            : guide.state === 'draft')),
  );
  return (
    <main id="main" tabIndex={-1} className={X.container}>
      <div className="flex items-center justify-between gap-6 max-[700px]:flex-col max-[700px]:items-start">
        <div className={X.pageHeading}>
          <StudioTrail workspace={workspace} section="Guides" current />
          <h1>Your guides</h1>
          <p>Good instructions start with a first draft.</p>
        </div>
        {workspace.role === 'manage' && (
          <a
            className={cn(buttonVariants(), 'max-[700px]:mb-6')}
            href={`/studio/${workspace.id}/new`}
          >
            <Plus size={18} /> New guide
          </a>
        )}
      </div>
      {workspace.role !== 'manage' ? (
        <div className={X.card}>
          <h2>Explore your workspace</h2>
          <p>Authoring is currently available to workspace owners.</p>
          <a
            className={buttonVariants()}
            href={workspace.audience === 'private' ? `/w/${workspace.id}` : '/'}
          >
            Open library
          </a>
        </div>
      ) : (
        <>
          <div className="mb-6 flex gap-4 max-[700px]:flex-col [&>label:last-child]:min-w-[170px]">
            <label className="relative flex-1 [&_input]:pl-10.5 [&_svg]:absolute [&_svg]:top-3.5 [&_svg]:left-3.5 [&_svg]:text-muted">
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
                <option value="withdrawn">Withdrawn</option>
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
              <p className={X.hint} role="status">
                {filtered!.length} {filtered!.length === 1 ? 'guide' : 'guides'}
              </p>
              <div className="mt-3 border-t border-solid border-t-line">
                {filtered!.map((guide) => (
                  <a
                    className="flex items-center justify-between gap-6 border-b border-solid border-b-line px-3 py-7 hover:bg-panel max-[700px]:flex-col max-[700px]:items-start [&_h2]:mx-0 [&_h2]:my-[7px] [&_h2]:text-[23px] [&_p]:max-w-[650px]"
                    key={guide.id}
                    href={`/studio/${workspace.id}/${guide.id}`}
                  >
                    <div>
                      <span className={X.eyebrow}>
                        {guide.category} · {guide.stepCount} steps
                      </span>
                      <h2>{guide.title}</h2>
                      <p>{guide.summary}</p>
                    </div>
                    <div className="flex min-w-[170px] flex-col items-end gap-2 max-[700px]:min-w-0 max-[700px]:flex-row max-[700px]:flex-wrap max-[700px]:items-center [&_small]:text-muted">
                      <span className={X.badge}>
                        {guide.state === 'withdrawn'
                          ? `Release ${guide.currentRelease} withdrawn`
                          : guide.currentRelease
                            ? `Release ${guide.currentRelease}`
                            : 'Draft'}
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
                <div className="px-6 py-17.5 text-center [&_p]:mx-0 [&_p]:mt-3 [&_p]:mb-6">
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
                    <a className={buttonVariants()} href={`/studio/${workspace.id}/new`}>
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
  onTitleEdited,
  titleInputRef,
  className,
}: {
  document: GuideDocument;
  audience?: 'public' | 'members';
  category: string | null;
  workspace: StudioWorkspace;
  onDocument: (document: GuideDocument) => void;
  onCategory: (category: string | null, chosen?: Category) => void;
  /**
   * Fired when the author types in the title box themselves. A composed title
   * is a suggestion, so it has to stop suggesting the moment someone disagrees
   * with it — and that is only knowable here, where the keystroke lands.
   */
  onTitleEdited?: () => void;
  titleInputRef?: Ref<HTMLInputElement>;
  /** Spacing the surrounding screen needs, such as the editor's canvas. */
  className?: string;
}) {
  return (
    <div className={cn('grid gap-6', className)}>
      <AuthoringSection
        id="guide-essentials-title"
        title="Guide essentials"
        description="Give readers a clear outcome and an idea of what to expect."
        icon={<FileText size={18} />}
      >
        <div className={X.form}>
          <label>
            Guide title
            <input
              ref={titleInputRef}
              required
              maxLength={140}
              value={document.title}
              onChange={(e) => {
                onTitleEdited?.();
                onDocument({ ...document, title: e.target.value });
              }}
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
          <div className="grid grid-cols-[2fr_1fr_1fr] gap-4 max-[1000px]:grid-cols-[1fr_1fr] max-[1000px]:[&>label:first-child]:col-[1/-1] max-[700px]:grid-cols-[1fr] max-[700px]:[&>label:first-child]:col-[auto]">
            <CategoryPicker
              workspace={workspace}
              domain="guide"
              value={category}
              onChange={onCategory}
              visibility={audience ?? (workspace.audience === 'public' ? 'public' : 'members')}
              required
              label="What is this about?"
            />
            <label>
              Difficulty
              <select
                value={document.difficulty}
                onChange={(e) =>
                  onDocument({
                    ...document,
                    difficulty: e.target.value as GuideDocument['difficulty'],
                  })
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
                onChange={(e) =>
                  onDocument({ ...document, durationMinutes: Number(e.target.value) })
                }
              />
            </label>
          </div>
        </div>
      </AuthoringSection>
      {document.schemaVersion === 5 && (
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
  // The kind of work, the thing it is about, and the answer to whatever the
  // type asks. Together these compose the title, which is why the thing's name
  // is kept and not only its id.
  const [types, setTypes] = useState<GuideType[]>([]);
  const [typesReady, setTypesReady] = useState(false);
  const [typesError, setTypesError] = useState(false);
  const [typesAttempt, setTypesAttempt] = useState(0);
  const typesStatus = useRef<HTMLParagraphElement>(null);
  const retryTypesButton = useRef<HTMLButtonElement>(null);
  const titleInput = useRef<HTMLInputElement>(null);
  const typesRetryOrigin = useRef<Element | null>(null);
  const [composeTitles, setComposeTitles] = useState(false);
  const [typeKey, setTypeKey] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [thingName, setThingName] = useState('');
  const titleEdited = useRef(false);
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
    let live = true;
    studioFetch<{ types: GuideType[]; composeTitles: boolean }>(
      `/api/studio/${workspace.id}/guide-types`,
    )
      .then((settings) => {
        if (!live) return;
        setTypes(settings.types);
        setComposeTitles(settings.composeTitles);
      })
      // Optional type settings must settle before the form becomes interactive:
      // inserting their panel above a pressed control can otherwise lose its click.
      .catch(() => {
        if (live) setTypesError(true);
      })
      .finally(() => {
        if (live) setTypesReady(true);
      });
    return () => {
      live = false;
    };
  }, [workspace.id, typesAttempt]);
  useEffect(() => {
    const origin = typesRetryOrigin.current;
    // Activation origin is consumed once, even if the author has already moved.
    typesRetryOrigin.current = null;
    const focused = window.document.activeElement;
    if (!typesAttempt || (focused !== window.document.body && focused !== origin)) return;
    // A fast response can retain the old form, and some browsers do not focus
    // clicked buttons. Restore from the activation origin or removed control,
    // while respecting a deliberate move elsewhere during the request.
    (!typesReady
      ? typesStatus.current
      : typesError
        ? retryTypesButton.current
        : titleInput.current
    )?.focus();
  }, [typesAttempt, typesReady, typesError]);

  const selectedType = types.find((type) => type.key === typeKey) ?? null;
  // Compose only while the author has left the title alone. The suggestion is
  // meant to save them the blank box, not to argue with them once they have
  // written something.
  useEffect(() => {
    if (!composeTitles || !selectedType || titleEdited.current || !thingName) return;
    const composed = composeGuideTitle(selectedType, { thing: thingName, subject });
    setDocument((current) =>
      !current || current.title === composed ? current : { ...current, title: composed },
    );
  }, [composeTitles, selectedType, subject, thingName]);
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
      setError(`Choose what this guide is about, or add a new ${words.thing}, before continuing.`);
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
          guideType: typeKey ? { key: typeKey, subject } : null,
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
    <main
      id="main"
      tabIndex={-1}
      className={cn(X.container, 'max-w-[1180px] py-10 [&_h1]:text-[38px]')}
    >
      <div className={X.pageHeading}>
        <StudioTrail workspace={workspace} section="Guides" />
        <h1>Start a guide.</h1>
        <p>Set the essentials, then bring each step to life. Nothing is published yet.</p>
      </div>
      {workspace.role !== 'manage' ? (
        <ErrorNotice error="Only workspace owners can create guides in this preview." />
      ) : !document || !typesReady ? (
        <p ref={typesStatus} role="status" tabIndex={-1}>
          Loading guide options…
        </p>
      ) : (
        <form
          className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_240px]"
          onSubmit={submit}
        >
          <div className="grid min-w-0 gap-6">
            {typesError && (
              <div className="grid gap-3 rounded-xl border border-line bg-panel p-4">
                <p role="alert" className="text-sm">
                  Guide types could not be loaded. You can still write your guide, or try again.
                </p>
                <button
                  ref={retryTypesButton}
                  type="button"
                  className={buttonVariants({ variant: 'secondary' })}
                  onClick={() => {
                    typesRetryOrigin.current = window.document.activeElement;
                    setTypesReady(false);
                    setTypesError(false);
                    setTypesAttempt((attempt) => attempt + 1);
                  }}
                >
                  Retry guide types
                </button>
              </div>
            )}
            {types.length > 0 && (
              <fieldset className={cn(authoringPanel, 'm-0 min-w-0')}>
                <legend className="float-start mb-1 w-full text-[17px] font-semibold tracking-tight">
                  What kind of work is this?
                </legend>
                <p className="clear-both mb-5 text-[13px] leading-5">
                  Choose the purpose of your guide. Your workspace’s types help readers find the
                  right instructions.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  {types.map((type) => {
                    const Icon =
                      (
                        {
                          repair: Wrench,
                          replacement: ArrowLeftRight,
                          disassembly: Layers3,
                          teardown: PackageOpen,
                          inspection: ClipboardCheck,
                          maintenance: Settings2,
                        } as Record<string, typeof Wrench>
                      )[type.key] ?? PenLine;
                    return (
                      <ChoiceCard
                        key={type.key}
                        title={type.label}
                        description={type.description}
                        icon={<Icon size={18} />}
                        name="guideType"
                        value={type.key}
                        checked={typeKey === type.key}
                        onChange={() => {
                          setTypeKey(type.key);
                          if (!type.prompt) setSubject('');
                        }}
                      />
                    );
                  })}
                </div>
                {selectedType?.prompt && (
                  <label className="mt-5 grid gap-2 border-t border-line pt-5 text-sm font-semibold text-ink [&_input]:font-normal">
                    {selectedType.prompt}
                    <input
                      maxLength={140}
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                    />
                  </label>
                )}
              </fieldset>
            )}
            <MetadataFields
              titleInputRef={titleInput}
              audience={audience}
              document={document}
              workspace={workspace}
              category={category}
              onDocument={setDocument}
              onCategory={(id, chosen) => {
                setCategory(id);
                setThingName(chosen?.name ?? '');
              }}
              onTitleEdited={() => {
                titleEdited.current = true;
              }}
            />
            {workspace.audience === 'public' ? (
              <fieldset className={cn(authoringPanel, 'm-0 min-w-0')}>
                <legend className="float-start mb-1 w-full text-[17px] font-semibold tracking-tight">
                  Section
                </legend>
                <p className="clear-both mb-5 text-[13px] leading-5">
                  Choose who can read it when published. You can move a guide between sections
                  later, from Guide details.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ChoiceCard
                    title="Public"
                    description="Anyone can read it once published."
                    icon={<Globe2 size={18} />}
                    name="audience"
                    value="public"
                    checked={audience === 'public'}
                    onChange={() => setAudience('public')}
                  />
                  <ChoiceCard
                    title="Internal"
                    description="Only active workspace members can read it."
                    icon={<LockKeyhole size={18} />}
                    name="audience"
                    value="members"
                    checked={audience === 'members'}
                    onChange={() => setAudience('members')}
                  />
                </div>
              </fieldset>
            ) : (
              <p className="flex items-start gap-2 rounded-xl border border-line bg-panel p-4 text-[13px]">
                <LockKeyhole size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
                Private workspace: published guides are only visible to active workspace members.
              </p>
            )}
            {error && <ErrorNotice error={error} />}
            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
              <a className={buttonVariants({ variant: 'ghost' })} href={`/studio/${workspace.id}`}>
                Cancel
              </a>
              <Button type="submit" loading={pending}>
                Create draft <ArrowRight size={17} />
              </Button>
            </div>
          </div>
          <aside
            className="rounded-2xl border border-line bg-panel p-5 hidden lg:sticky lg:top-28 lg:block"
            aria-label="About your draft"
          >
            <div className="mb-3 flex items-center gap-2 text-[13px] font-semibold">
              <span className="size-2 rounded-full bg-action" aria-hidden="true" /> New draft
            </div>
            <p className="text-[13px] leading-6">
              Your guide belongs to{' '}
              <strong className="font-semibold text-ink">{workspace.name}</strong>. It stays
              unpublished until you choose to share a release.
            </p>
            <div className="mt-5 border-t border-line pt-4 max-lg:hidden">
              <p className="mb-3 text-[12px] font-semibold text-ink">Next, in the editor</p>
              <ul className="m-0 grid list-none gap-3 p-0 text-[12px] text-muted">
                {[
                  'Write and illustrate each step',
                  'Assign tools and materials',
                  'Preview, save and publish',
                ].map((text) => (
                  <li key={text} className="flex items-center gap-2">
                    <Check size={14} aria-hidden="true" />
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </form>
      )}
    </main>
  );
}
