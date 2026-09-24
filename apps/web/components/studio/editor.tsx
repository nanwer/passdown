'use client';
import * as X from './studio-styles';
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  Globe2,
  ImagePlus,
  LockKeyhole,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { Button, Dialog, cn } from '@guide/ui';
import { StepRenderer } from '@guide/guide-ui';
import {
  guideDocumentSchema,
  toStructuredDocument,
  getRequirementIssues,
  type GuideStep,
  annotationPercent,
  roundPosition,
} from '@guide/content';
import type {
  ContentLicense,
  WorkspaceAsset,
  DraftGuide,
  GuidePublicBlocker,
  StudioWorkspace,
} from '@guide/contracts';
import { SessionGate, ErrorNotice, StudioTrail } from './frame';
import { MetadataFields } from './pages';
import { moveBy, newStep, reorder } from './model';
import { RemoveStepDialog } from './remove-step-dialog';
import { RichTextEditor } from './rich-text-editor';
import { StepRequirements } from './step-requirements';
import { StudioError, studioFetch, studioUpload } from './transport';
// Pictures: the cover and each step's, with the controls to add and order them.
const pictureAddClass = cn(
  X.pictureAddParts,
  'inline-flex w-[fit-content] cursor-pointer flex-row items-center gap-[11px] rounded-[10px] border border-dashed border-control px-4.5 py-[13px] text-muted hover:border-action hover:text-ink focus-within:[outline:2px_solid_var(--gp-semantic-action-primary-background)] focus-within:outline-offset-[2px] max-[640px]:w-full',
);
const pictureAddOver = 'border-action text-ink';
const picturesClass =
  'm-0 grid gap-3 [border:0] p-0 [&_legend]:p-0 [&_legend]:text-[13px] [&_legend]:text-muted';
const pictureCard =
  'studio-picture grid gap-3 rounded-[10px] border border-solid border-line p-3.5 [&_img]:h-22.5 [&_img]:w-30 [&_img]:rounded-[7px] [&_img]:bg-sunken [&_img]:object-cover max-[640px]:[&_img]:h-40 max-[640px]:[&_img]:w-full [&_label]:grid [&_label]:gap-[5px] [&_label]:text-[12px] [&_label]:text-muted [&_label_input]:w-full';
const pictureBody =
  'grid grid-cols-[120px_minmax(0,1fr)] [align-items:start] gap-3.5 max-[640px]:grid-cols-[1fr]';
const pictureFields = 'grid min-w-0 gap-2.5';
const pictureFooter = 'flex flex-wrap gap-2';
const pictureProgress =
  'flex flex-wrap items-center gap-2.5 [&_label]:grid [&_label]:flex-[1_1_200px] [&_label]:gap-1 [&_label]:text-[13px] [&_progress]:h-2 [&_progress]:w-full';
const pictureActions = 'flex flex-wrap items-center gap-2';
const outlineItem =
  'studio-outline-item flex w-full items-baseline gap-3.5 rounded-[6px] border border-solid border-transparent bg-transparent px-3 py-[13px] text-start text-[14px] wrap-anywhere [&_span]:shrink-0 [&_span]:font-[monospace] [&_span]:text-[12px] [&_span]:text-muted [&_strong]:min-w-0';
const outlineItemSelected =
  'selected border-action bg-raised forced-colors:border-2 forced-colors:border-solid forced-colors:border-[Highlight]';
const annotateHandle =
  'studio-annotate-handle absolute inline-flex h-6.5 min-w-[26px] [transform:translate(-50%,-50%)] cursor-grab items-center justify-center rounded-[999px] border-2 border-solid border-raised bg-action p-0 text-[12px] font-bold text-action-ink';

function fingerprint(guide: DraftGuide) {
  return JSON.stringify({
    document: guide.document,
    categoryId: guide.categoryId,
    coverAssetId: guide.coverAssetId,
  });
}

/**
 * Pictures for one step.
 *
 * An upload is held here until it has a description, and only then added to
 * the document. The content schema requires alt text, so attaching first and
 * asking later would mean the author's next save failed for a reason that
 * arrived long after the choice that caused it.
 */
type Annotation = GuideStep['media'][number]['annotations'][number];
/** A handle is one movable end: a pin has one, an arrow has a tail and a head. */
type Handle = { index: number; end: 'from' | 'to' };

/**
 * Drawing on a photograph.
 *
 * The overlay is the quick way — click where you mean — but it is not the only
 * way. Every marker is a button that can be focused and nudged with the arrow
 * keys, and every label is an ordinary text field in the list below, so the
 * whole feature works without a pointer. The list is also what a reader gets:
 * markers are decorative, and the numbered labels carry the meaning.
 */
function PictureAnnotations({
  src,
  annotations,
  onChange,
}: {
  src: string;
  annotations: Annotation[];
  onChange: (annotations: Annotation[]) => void;
}) {
  const [focused, setFocused] = useState<Handle | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [imageRatio, setImageRatio] = useState(4 / 3);

  const clamp = (value: number) => roundPosition(Math.min(Math.max(value, 0), 1));
  const replace = (index: number, changes: Partial<Annotation>) =>
    onChange(annotations.map((a, i) => (i === index ? ({ ...a, ...changes } as Annotation) : a)));

  /** Where a pointer event landed, as a fraction of the image. */
  const pointAt = (event: { clientX: number; clientY: number }) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box || !box.width || !box.height) return null;
    return {
      x: clamp((event.clientX - box.left) / box.width),
      y: clamp((event.clientY - box.top) / box.height),
    };
  };

  const add = (type: Annotation['type'], at?: { x: number; y: number }) => {
    if (annotations.length >= 30) return;
    const point = at ?? { x: 0.5, y: 0.5 };
    const next: Annotation =
      type === 'pin'
        ? { type: 'pin', ...point, label: '' }
        : {
            type: 'arrow',
            ...point,
            toX: clamp(point.x + 0.2),
            toY: clamp(point.y + 0.2),
            label: '',
          };
    onChange([...annotations, next]);
    setFocused({ index: annotations.length, end: 'from' });
  };

  const move = (handle: Handle, dx: number, dy: number) => {
    const current = annotations[handle.index];
    if (!current) return;
    if (handle.end === 'to' && current.type === 'arrow')
      replace(handle.index, { toX: clamp(current.toX + dx), toY: clamp(current.toY + dy) });
    else replace(handle.index, { x: clamp(current.x + dx), y: clamp(current.y + dy) });
  };

  const nudge = (handle: Handle) => (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    // Shift is the fine adjustment, for placing a marker on a small detail.
    const step = event.shiftKey ? 0.005 : 0.02;
    const by: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = by[event.key];
    if (!delta) return;
    event.preventDefault();
    move(handle, delta[0], delta[1]);
  };

  const handles: (Handle & { x: number; y: number; label: string })[] = annotations.flatMap(
    (a, index) => [
      { index, end: 'from' as const, x: a.x, y: a.y, label: `${index + 1}` },
      ...(a.type === 'arrow'
        ? [{ index, end: 'to' as const, x: a.toX, y: a.toY, label: `${index + 1}` }]
        : []),
    ],
  );

  const describe = (handle: Handle) => {
    const a = annotations[handle.index];
    const what = a?.label?.trim() || `Mark ${handle.index + 1}`;
    if (a?.type !== 'arrow') return `${what}. Arrow keys move it.`;
    return `${what}, ${handle.end === 'from' ? 'tail' : 'point'}. Arrow keys move it.`;
  };

  return (
    <div className="mt-2.5 grid gap-2.5">
      {/* Keep controls stationary while the photograph decodes. The inner frame
          follows the photograph's fitted bounds, so marks never include letterboxing. */}
      <div className="relative aspect-[4/3] overflow-hidden rounded-[10px] border border-solid border-line bg-sunken">
        <div
          className="studio-annotate-frame absolute top-1/2 left-1/2 block max-h-full max-w-full -translate-x-1/2 -translate-y-1/2 cursor-crosshair [&&_img]:absolute [&&_img]:inset-0 [&&_img]:block [&&_img]:h-full [&&_img]:w-full [&&_img]:object-contain"
          style={{
            aspectRatio: imageRatio,
            // Fit within the reserved 4:3 stage without letting intrinsic image
            // dimensions expand a grid track or a percentage-height container.
            width: `${Math.min(1, (3 / 4) * imageRatio) * 100}%`,
          }}
          ref={frame}
          onClick={(event) => {
            // Only a click on the image itself adds a mark; a click on an
            // existing one is selecting it, not making another.
            if (
              event.target !== event.currentTarget &&
              (event.target as HTMLElement).tagName !== 'IMG'
            )
              return;
            const point = pointAt(event);
            if (point) add('pin', point);
          }}
        >
          <img
            src={src}
            alt=""
            onLoad={(event) => {
              const picture = event.currentTarget;
              if (picture.naturalWidth && picture.naturalHeight)
                setImageRatio(picture.naturalWidth / picture.naturalHeight);
            }}
          />
          <svg
            className="pointer-events-none absolute inset-0 size-full [&_line]:stroke-action [&_line]:[stroke-linecap:round] [&_line]:[stroke-width:3]"
            aria-hidden="true"
          >
            {annotations.map((a, index) =>
              a.type === 'arrow' ? (
                <line
                  key={index}
                  x1={annotationPercent(a.x)}
                  y1={annotationPercent(a.y)}
                  x2={annotationPercent(a.toX)}
                  y2={annotationPercent(a.toY)}
                />
              ) : null,
            )}
          </svg>
          {handles.map((handle) => (
            <button
              key={`${handle.index}-${handle.end}`}
              type="button"
              className={
                focused && focused.index === handle.index && focused.end === handle.end
                  ? `${annotateHandle} selected [outline:2px_solid_var(--gp-semantic-focus-ring)] outline-offset-[2px]`
                  : annotateHandle
              }
              style={{ left: annotationPercent(handle.x), top: annotationPercent(handle.y) }}
              aria-label={describe(handle)}
              onFocus={() => setFocused({ index: handle.index, end: handle.end })}
              onKeyDown={nudge({ index: handle.index, end: handle.end })}
            >
              {handle.end === 'from' ? handle.label : ''}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={annotations.length >= 30}
          onClick={() => add('pin')}
        >
          Add a mark
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={annotations.length >= 30}
          onClick={() => add('arrow')}
        >
          Add an arrow
        </Button>
        <p className={cn(X.hint, 'm-0 flex-[1_1_260px]')}>
          Click the picture to place a mark, or add one and move it with the arrow keys. Hold shift
          to move it a little at a time. Every label is read out with the step, so write what the
          mark is pointing at.
        </p>
      </div>
      {annotations.length > 0 && (
        <ol className="m-0 grid gap-2 pl-5.5 [&_input]:flex-1 [&_li]:flex [&_li]:items-center [&_li]:gap-2">
          {annotations.map((a, index) => (
            <li key={index}>
              <label>
                <span className="sr-only">
                  {a.type === 'arrow' ? 'Arrow' : 'Mark'} {index + 1} label
                </span>
                <input
                  value={a.label}
                  maxLength={80}
                  placeholder={a.type === 'arrow' ? 'Slide it this way' : 'The centre screw'}
                  onChange={(event) => replace(index, { label: event.target.value })}
                />
              </label>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  onChange(annotations.filter((_, i) => i !== index));
                  setFocused(null);
                }}
              >
                <Trash2 size={15} />
                Remove
              </Button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/**
 * Choosing a picture already in this workspace.
 *
 * The same photograph often belongs on several steps — the same bench, the
 * same model of fridge — and uploading it again would store it twice and give
 * it a second identity, so one of the two would drift out of use without
 * anyone noticing. Thumbnails are requested at the smallest served width,
 * because a grid of pictures is exactly where the full size would be wasteful.
 */
/**
 * The picture that stands for this guide in a listing.
 *
 * Every card in the library drew the same illustration, because the column
 * behind it has a default and nothing that writes to it. A card can fall back
 * to the guide's first step picture or to the picture of the thing it is about,
 * and it does — but a cover is a decision about how a guide is presented, and
 * until now there was nowhere to make it.
 */
function GuideCover({
  workspaceId,
  coverAssetId,
  onChange,
}: {
  workspaceId: string;
  coverAssetId: string | null;
  onChange: (assetId: string | null) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [dropping, setDropping] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setBusy(true);
    setError('');
    setProgress(0);
    try {
      const { asset } = await studioUpload<{ asset: { id: string } }>(
        `/api/studio/${workspaceId}/assets`,
        file,
        setProgress,
      );
      onChange(asset.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That picture could not be added.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <fieldset
      className={cn(
        picturesClass,
        // A variant, so it lands after the fieldset's border reset.
        '[&]:[border-top:1px_solid_var(--gp-semantic-border-subtle)] pt-4 [&_legend]:font-semibold [&_legend]:text-ink',
      )}
    >
      <legend>Cover picture</legend>
      <p className={X.hint}>
        Shown wherever this guide appears in a list. Without one, a listing falls back to the first
        picture on a step, and then to the picture of the thing this guide is about.
      </p>
      {coverAssetId && (
        <div className={pictureCard}>
          <div className={pictureBody}>
            <img src={`/api/media/${workspaceId}/${coverAssetId}`} alt="" />
            <div className={pictureFields}>
              <p className={X.hint}>This guide has its own cover.</p>
            </div>
          </div>
          <div className={pictureFooter}>
            <Button type="button" variant="secondary" onClick={() => onChange(null)}>
              Remove cover
            </Button>
          </div>
        </div>
      )}
      {busy ? (
        <div className={pictureProgress}>
          <label>
            Adding your picture
            <progress value={progress} max={1} />
          </label>
        </div>
      ) : (
        <div className={pictureActions}>
          <label
            className={cn(pictureAddClass, dropping && pictureAddOver)}
            onDragOver={(event) => {
              event.preventDefault();
              setDropping(true);
            }}
            onDragLeave={() => setDropping(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDropping(false);
              const file = event.dataTransfer.files?.[0];
              if (file) void upload(file);
            }}
          >
            <ImagePlus size={17} aria-hidden="true" />
            <span>
              <strong>{coverAssetId ? 'Replace the cover' : 'Add a cover'}</strong>
              <small>Drop one here, or choose a file</small>
            </span>
            <input
              ref={input}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
          </label>
          <ReusePicture
            workspaceId={workspaceId}
            used={coverAssetId ? [coverAssetId] : []}
            onPick={(assetId) => onChange(assetId)}
          />
        </div>
      )}
      {error && <ErrorNotice error={error} />}
    </fieldset>
  );
}

function ReusePicture({
  workspaceId,
  used,
  onPick,
}: {
  workspaceId: string;
  used: string[];
  onPick: (assetId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<WorkspaceAsset[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    let active = true;
    setAssets(null);
    setError('');
    void studioFetch<{ assets: WorkspaceAsset[]; total: number }>(
      `/api/studio/${workspaceId}/assets`,
    )
      .then((result) => {
        if (active) setAssets(result.assets);
      })
      .catch((e) => {
        if (active) {
          setAssets([]);
          setError(e instanceof Error ? e.message : 'Those pictures could not be listed.');
        }
      });
    return () => {
      active = false;
    };
  }, [open, workspaceId]);

  const available = (assets ?? []).filter((asset) => !used.includes(asset.id));

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Use a picture again"
      description="Pictures already added to this workspace. Choosing one adds it to this step without uploading it a second time."
      size="wide"
      trigger={
        <Button type="button" variant="secondary">
          <Copy size={16} />
          Use one already added
        </Button>
      }
    >
      {error && <ErrorNotice error={error} />}
      {assets === null ? (
        <p className={X.hint}>Looking for pictures…</p>
      ) : available.length === 0 ? (
        <p className={X.hint}>
          {assets.length === 0
            ? 'No pictures have been added to this workspace yet.'
            : 'Every picture in this workspace is already on this step.'}
        </p>
      ) : (
        <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-2.5 p-0 [&_button]:grid [&_button]:w-full [&_button]:cursor-pointer [&_button]:gap-1.5 [&_button]:rounded-[10px] [&_button]:border [&_button]:border-solid [&_button]:border-control [&_button]:bg-raised [&_button]:p-1.5 [&_button]:text-left [&_button]:text-[12px] [&_button]:text-inherit [&_img]:block [&_img]:aspect-[4/3] [&_img]:w-full [&_img]:rounded-[6px] [&_img]:bg-sunken [&_img]:object-cover [&_small]:block [&_small]:text-muted">
          {available.map((asset) => (
            <li key={asset.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(asset.id);
                  setOpen(false);
                }}
              >
                <img
                  src={`/api/media/${workspaceId}/${asset.id}?w=400`}
                  alt=""
                  loading="lazy"
                  decoding="async"
                />
                <span>
                  {asset.width} × {asset.height}
                  {/* The picture is the identifier here; the date only tells
                      two similar ones apart. */}
                  <small>{new Date(asset.createdAt).toLocaleDateString()}</small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

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
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  /**
   * The file that failed, kept so the author can try the same one again.
   * Without it a failure means finding the photograph in the file picker a
   * second time, which is the moment someone gives up on a slow connection.
   */
  const [failed, setFailed] = useState<File | null>(null);
  const [dropping, setDropping] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cancel = useRef<AbortController | null>(null);

  async function upload(file: File) {
    cancel.current = new AbortController();
    setBusy(true);
    setError('');
    setFailed(null);
    setProgress(0);
    try {
      const result = await studioUpload<{ asset: { id: string } }>(
        `/api/studio/${workspaceId}/assets`,
        file,
        setProgress,
        cancel.current.signal,
      );
      setPending({ id: result.asset.id });
      setAlt('');
    } catch (e) {
      const stopped = e instanceof StudioError && e.code === 'ABORTED';
      setError(stopped ? '' : e instanceof Error ? e.message : 'That picture could not be added.');
      // A picture the server refused will be refused again; only offer to
      // retry what might succeed a second time.
      const worthRetrying = !stopped && !(e instanceof StudioError && e.status === 422);
      setFailed(worthRetrying ? file : null);
    } finally {
      setBusy(false);
      cancel.current = null;
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  return (
    <fieldset className={picturesClass}>
      <legend>Pictures</legend>
      {step.media.map((media, position) => (
        <div className={pictureCard} key={media.assetId}>
          <div className="flex items-center justify-between gap-2">
            <span className={X.eyebrow}>
              Picture {position + 1} of {step.media.length}
            </span>
            <div className="flex gap-0.5">
              <Button
                type="button"
                variant="ghost"
                disabled={position === 0}
                aria-label={`Move picture ${position + 1} earlier`}
                onClick={() => onChange({ ...step, media: moveBy(step.media, position, -1) })}
              >
                <ArrowUp size={15} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={position === step.media.length - 1}
                aria-label={`Move picture ${position + 1} later`}
                onClick={() => onChange({ ...step, media: moveBy(step.media, position, 1) })}
              >
                <ArrowDown size={15} />
              </Button>
            </div>
          </div>
          <div className={pictureBody}>
            <img src={`/api/media/${workspaceId}/${media.assetId}`} alt={media.alt} />
            <div className={pictureFields}>
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
              <label>
                Caption
                <input
                  value={media.caption}
                  maxLength={200}
                  placeholder="Shown under the picture. Optional."
                  onChange={(e) =>
                    onChange({
                      ...step,
                      media: step.media.map((m) =>
                        m.assetId === media.assetId ? { ...m, caption: e.target.value } : m,
                      ),
                    })
                  }
                />
              </label>
            </div>
          </div>
          <PictureAnnotations
            src={`/api/media/${workspaceId}/${media.assetId}`}
            annotations={media.annotations}
            onChange={(annotations) =>
              onChange({
                ...step,
                media: step.media.map((m) =>
                  m.assetId === media.assetId ? { ...m, annotations } : m,
                ),
              })
            }
          />
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
            Remove picture
          </Button>
        </div>
      ))}

      {pending ? (
        <div className={cn(pictureCard, 'studio-picture--pending border-dashed bg-sunken')}>
          <div className={pictureBody}>
            <img src={`/api/media/${workspaceId}/${pending.id}`} alt="" />
            <div className={pictureFields}>
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
            </div>
          </div>
          <div className={pictureFooter}>
            <Button
              type="button"
              disabled={!alt.trim()}
              onClick={() => {
                onChange({
                  ...step,
                  media: [
                    ...step.media,
                    { assetId: pending.id, alt: alt.trim(), caption: '', annotations: [] },
                  ],
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
        </div>
      ) : busy ? (
        <div className={pictureProgress}>
          <label>
            Adding your picture
            <progress value={progress} max={1} />
          </label>
          <span role="status">{Math.round(progress * 100)}% sent</span>
          <Button type="button" variant="secondary" onClick={() => cancel.current?.abort()}>
            Stop
          </Button>
        </div>
      ) : failed ? (
        <div className="grid gap-2.5">
          <ErrorNotice error={error} />
          <div className={pictureActions}>
            <Button type="button" onClick={() => void upload(failed)}>
              Try again
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setFailed(null);
                setError('');
              }}
            >
              Choose a different picture
            </Button>
          </div>
        </div>
      ) : (
        step.media.length < 10 && (
          <div className={pictureActions}>
            {/* The label is the control; the file input behind it is what the
                browser needs and what nobody should have to look at. It used to
                render as "Choose File / No file chosen" inside the dashed box,
                which is the browser's widget rather than this app's. */}
            <label
              className={cn(pictureAddClass, dropping && pictureAddOver)}
              onDragOver={(event) => {
                event.preventDefault();
                setDropping(true);
              }}
              onDragLeave={() => setDropping(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDropping(false);
                const file = event.dataTransfer.files?.[0];
                if (file) void upload(file);
              }}
            >
              <ImagePlus size={17} aria-hidden="true" />
              <span>
                <strong>Add a picture</strong>
                <small>Drop one here, or choose a file</small>
              </span>
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
            <ReusePicture
              workspaceId={workspaceId}
              used={step.media.map((m) => m.assetId)}
              // A reused picture still needs its own description: the same
              // photograph illustrates a different thing on a different step.
              onPick={(assetId) => {
                setPending({ id: assetId });
                setAlt('');
              }}
            />
          </div>
        )
      )}
      {error && !failed && <ErrorNotice error={error} />}
      <p className={X.hint}>
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
  onMoved: (guide: DraftGuide) => void;
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
      const result = await studioFetch<{ guide: DraftGuide }>(
        `/api/studio/${workspaceId}/guides/${guideId}/audience`,
        {
          method: 'PUT',
          body: JSON.stringify({ audience: next, expectedRelease: currentRelease }),
        },
      );
      onMoved(result.guide);
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
        ? `It is published under ${blocker.name}, which only members can see.`
        : `The published version uses ${blocker.name}, a members-only catalog item.`;

  return (
    <div className="mt-4.5 grid gap-2 border-t border-solid border-t-line pt-4.5 [&_button]:[justify-self:start] [&_h3]:m-0 [&_h3]:text-[14px]">
      <h3>Section</h3>
      <p className={X.hint}>
        {audience === 'public'
          ? 'Anyone can read the published version of this guide.'
          : 'Only members of this workspace can read this guide.'}
      </p>
      {audience === 'members' ? (
        blockers === null ? (
          <p className={X.hint}>Checking what this guide depends on…</p>
        ) : blockers.length ? (
          <div className="rounded-[8px] border border-solid border-note-line bg-note-surface px-3.5 py-3 text-[13px] text-note [&_p]:mx-0 [&_p]:mt-0 [&_p]:mb-1.5 [&_p]:font-semibold [&_ul]:m-0 [&_ul]:grid [&_ul]:gap-1 [&_ul]:pl-4.5">
            <p>This guide cannot move to the public section yet:</p>
            <ul>
              {blockers.map((blocker) => (
                <li key={`${blocker.kind}:${blocker.name}`}>{describe(blocker)}</li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <p className={X.hint}>
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
          <p className={X.hint}>
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
      {saved && <p className={X.success}>{saved}</p>}
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
      studioFetch<{ parent: { id: string } | null }>(
        `/api/studio/${workspaceId}/guides/${guideId}/family`,
      ),
    ])
      .then(([list, family]) => {
        if (!active) return;
        setCandidates(list.guides.filter((g) => g.id !== guideId));
        // The exact parent this guide was filed under, published or not. Read
        // from the reader's ancestor trail, an unpublished parent vanished and
        // a published grandparent took its place in the control.
        setParentId(family.parent?.id ?? '');
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
    <div className="mt-4.5 grid gap-2 border-t border-solid border-t-line pt-4.5 [&_label]:grid [&_label]:gap-1.5 [&_label]:text-[13px]">
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
      <p className={X.hint}>
        For a range and its models: readers of the broader guide can narrow to this one, and readers
        here can step back up. Separate from its category.
      </p>
      {saved && <p className={X.success}>{saved}</p>}
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
  const stepTitle = useRef<HTMLInputElement>(null);
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
      setError('Choose what this guide is about before saving.');
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
          coverAssetId: snapshot.coverAssetId,
          // Sent even though omission now preserves it: the editor holds the
          // guide's type on screen, so leaving it out of the save would mean
          // the payload no longer describes what the author is looking at.
          guideType: snapshot.guideType,
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
              state: stored.state,
              publicationRevision: stored.publicationRevision,
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
      const result = await studioFetch<{
        guide: { release: number };
        url: string;
        publicationRevision: number;
      }>(`${endpoint}/publish`, {
        method: 'POST',
        body: JSON.stringify({
          expectedVersion: guide.version,
          expectedRelease: guide.currentRelease,
          expectedPublicationRevision: guide.publicationRevision,
          license: guide.audience === 'members' ? 'all-rights-reserved' : license,
        }),
      });
      setGuide((latest) =>
        latest
          ? {
              ...latest,
              state: 'published',
              publicationRevision: result.publicationRevision,
              currentRelease: result.guide.release,
              publishedVersion: guide.version,
            }
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
      <main id="main" tabIndex={-1} className={X.container}>
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
    <main id="main" tabIndex={-1} className="bg-editor-backdrop">
      <form onSubmit={save}>
        <header className="flex items-center justify-between gap-6 border-b border-solid border-b-line bg-panel px-[4%] py-5.5 max-[1000px]:flex-col max-[1000px]:items-start max-[700px]:px-5 [&_h1]:mx-0 [&_h1]:mt-[9px] [&_h1]:mb-3 [&_h1]:max-w-[800px] [&_h1]:text-[28px] [&_h1]:tracking-[-0.7px] [&_h1]:wrap-anywhere">
          <div>
            <StudioTrail workspace={workspace} section="Guides" />
            <h1>{guide.document.title || 'Untitled guide'}</h1>
            <div className={X.inline}>
              <span className={X.badge}>
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
              <span className={X.hint}>
                Draft v{guide.version}
                {guide.currentRelease
                  ? ` · Release ${guide.currentRelease}${changedRelease ? ' · Unpublished changes' : ' · Up to date'}`
                  : ' · Not published'}
              </span>
            </div>
          </div>
          <div className={cn(X.actions, 'max-[700px]:gap-2')}>
            <Button
              variant="secondary"
              className="max-[700px]:p-2.5"
              onClick={() => setPreview(!preview)}
              aria-pressed={preview}
              disabled={!preview && invalidContent}
            >
              <Eye size={17} />
              {preview ? 'Edit step' : 'Preview'}
            </Button>
            <Button
              type="submit"
              className="max-[700px]:p-2.5"
              disabled={!dirty || conflict || !!pending || invalidContent}
              loading={pending === 'save'}
            >
              <Save size={17} />
              Save draft
            </Button>
            {guide.currentRelease && (
              <a
                className={X.textLink}
                href={
                  guide.audience === 'public' && workspace.isRoot
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
                  className="max-[700px]:p-2.5"
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
              <div className="studio grid min-h-0 gap-5 bg-transparent text-ink [&>[role=alert]]:m-0">
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
          <p className="bg-warning-surface px-[4%] py-2.5 text-[13px] text-warning">
            Save your changes before publishing. Saving does not publish.
          </p>
        )}
        {invalidContent && (
          <div className={X.notice} role="alert">
            Fix the instructions in{' '}
            {guide.document.steps
              .filter((item) => editorErrors[item.id])
              .map((item) => item.title)
              .join(', ')}{' '}
            before saving or publishing. Your edits are retained while switching steps.
          </div>
        )}
        {(error || invalidContent) && (
          <div className="px-[4%] pt-0 pb-6 [&_textarea]:mt-3">
            {error && <ErrorNotice error={error} />}
            <div className={X.actions}>
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
          <div className={X.notice} role="status">
            Release published.{' '}
            <a ref={publishedLink} className={X.textLink} href={releaseUrl}>
              Read published guide
            </a>
          </div>
        )}
        {requirementIssues.length > 0 && (
          <div
            className={X.notice}
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
                    className="[border:0] [background:none] px-0 py-[3px] text-start text-inherit underline underline-offset-[3px]"
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
        <div className="mx-auto my-auto grid min-h-[660px] max-w-[1600px] grid-cols-[260px_minmax(0,1fr)] max-[700px]:grid-cols-[1fr]">
          <aside className="studio-outline border-e border-solid border-e-line px-5 py-8 max-[700px]:[border-inline-end:0] max-[700px]:border-b max-[700px]:border-solid max-[700px]:border-b-line max-[700px]:p-5 [&_ol]:mx-0 [&_ol]:mt-0 [&_ol]:mb-6 [&_ol]:grid [&_ol]:list-none [&_ol]:gap-2 [&_ol]:p-0 max-[700px]:[&_ol]:mx-0 max-[700px]:[&_ol]:mt-0 max-[700px]:[&_ol]:mb-4 max-[700px]:[&_ol]:max-h-52.5 max-[700px]:[&_ol]:overflow-y-auto max-[700px]:[&_ol]:p-[5px]">
            <button
              type="button"
              className={cn(outlineItem, metadata && outlineItemSelected)}
              onClick={() => setMetadata(true)}
              aria-current={metadata ? 'step' : undefined}
            >
              <span>—</span>
              <strong>Guide details</strong>
            </button>
            <div className="mx-3 mt-7 mb-4 flex items-center justify-between text-[12px] text-muted max-[700px]:mx-3 max-[700px]:mt-3.5 max-[700px]:mb-2">
              <span className={X.eyebrow}>Steps</span>
              <span>{steps.length} / 100</span>
            </div>
            <ol>
              {steps.map((item, i) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={cn(
                      outlineItem,
                      !metadata && step.id === item.id && outlineItemSelected,
                    )}
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
            <p className={cn(X.hint, 'mt-6 max-[700px]:mt-3')}>
              Changes stay in this tab until you save.
            </p>
          </aside>
          <section className="studio-editor-canvas w-full max-w-[1160px] min-w-0 px-[clamp(18px,3vw,48px)] pt-7 pb-12 max-[700px]:px-4 max-[700px]:pt-5 max-[700px]:pb-9">
            {metadata ? (
              <>
                <span className={X.eyebrow}>The essentials</span>
                <h2 className="mx-0 mt-2 mb-5">Guide details</h2>
                <MetadataFields
                  className="mt-6.5"
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
                <GuideCover
                  workspaceId={guide.workspaceId}
                  coverAssetId={guide.coverAssetId}
                  onChange={(coverAssetId) =>
                    setGuide((current) => (current ? { ...current, coverAssetId } : current))
                  }
                />
                <GuideFamilyPicker workspaceId={guide.workspaceId} guideId={guide.id} />
                <GuideSectionPicker
                  workspaceId={guide.workspaceId}
                  guideId={guide.id}
                  audience={guide.audience}
                  currentRelease={guide.currentRelease}
                  onMoved={(moved) =>
                    setGuide((current) =>
                      current
                        ? {
                            ...current,
                            audience: moved.audience,
                            publicationRevision: moved.publicationRevision,
                          }
                        : current,
                    )
                  }
                />
              </>
            ) : preview ? (
              <div className="studio-live-preview [&_.reader-step]:mt-6 [&_.step-layout]:block [&_h2]:mx-0 [&_h2]:mt-2 [&_h2]:mb-5">
                <span className={X.eyebrow}>Reader preview · Step {index + 1}</span>
                <StepRenderer
                  document={guide.document}
                  step={step}
                  index={index}
                  mediaSrc={(assetId, width) =>
                    `/api/media/${guide.workspaceId}/${assetId}${width ? `?w=${width}` : ''}`
                  }
                />
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-4 border-b border-solid border-b-editor-line pb-5.5 max-[700px]:flex-col max-[700px]:items-start max-[700px]:gap-2.5 max-[700px]:pb-4">
                  <span className={cn(X.eyebrow, 'whitespace-nowrap text-editor-muted')}>
                    Step {index + 1} of {steps.length}
                  </span>
                  <div className="m-0 flex flex-wrap gap-0.5 [border:0] p-0">
                    <Button
                      variant="quiet"
                      size="tool"
                      disabled={index <= 0}
                      onClick={() => changeSteps(reorder(steps, step.id, -1))}
                    >
                      <ArrowUp size={16} />
                      Move up
                    </Button>
                    <Button
                      variant="quiet"
                      size="tool"
                      disabled={index >= steps.length - 1}
                      onClick={() => changeSteps(reorder(steps, step.id, 1))}
                    >
                      <ArrowDown size={16} />
                      Move down
                    </Button>
                    <Button
                      variant="quiet"
                      size="tool"
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
                    <RemoveStepDialog
                      step={step}
                      steps={steps}
                      onReview={setSelected}
                      focusStep={() => requestAnimationFrame(() => stepTitle.current?.focus())}
                      onRemove={() => {
                        changeSteps(
                          steps
                            .filter((item) => item.id !== step.id)
                            .map((item) => ({
                              ...item,
                              earlierStepIds: ((item as GuideStep).earlierStepIds ?? []).filter(
                                (id) => id !== step.id,
                              ),
                            })),
                        );
                        setEditorDrafts((previous) => {
                          const next = { ...previous };
                          delete next[step.id];
                          return next;
                        });
                        setEditorErrors((previous) => {
                          const next = { ...previous };
                          delete next[step.id];
                          return next;
                        });
                        setSelected(steps[index === 0 ? 1 : index - 1]!.id);
                      }}
                    />
                  </div>
                </div>
                <div className={cn(X.form, 'mt-6')}>
                  <label className="gap-2 text-[12px] text-editor-muted [&_input]:-ml-2.5 [&_input]:w-[calc(100%_+_10px)] [&_input]:rounded-[6px] [&_input]:border [&_input]:border-solid [&_input]:border-transparent [&_input]:bg-transparent [&_input]:px-2.5 [&_input]:py-2 [&_input]:text-[clamp(22px,2vw,28px)] [&_input]:leading-[1.35] [&_input]:font-[650] [&_input]:tracking-[-0.025em] [&_input]:text-editor-ink [&_input:hover:not(:focus)]:border-editor-line [&_input:focus]:border-action [&_input:focus]:bg-editor-canvas">
                    Step title
                    <input
                      ref={stepTitle}
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
                {guide.document.schemaVersion === 5 && (
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
                  <div className={X.notice}>
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
