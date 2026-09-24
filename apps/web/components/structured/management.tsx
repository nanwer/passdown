'use client';
import * as X from '../studio/studio-styles';
import * as S from './structured-styles';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Archive,
  FolderPlus,
  FolderTree,
  Minus,
  Pencil,
  Plus,
  Package,
  RotateCcw,
  ShieldCheck,
  Globe,
} from 'lucide-react';
import { Button, Dialog, cn } from '@guide/ui';
import type {
  Category,
  CategoryBlockers,
  CategoryCounts,
  CatalogItem,
  CatalogUsageCounts,
  StudioWorkspace,
  CategoryManagementPage as CategoryPage,
  CatalogManagementPage as CatalogPage,
} from '@guide/contracts';
import { SessionGate, ErrorNotice, StudioTrail } from '../studio/frame';
import { ManageTabs } from '../studio/manage';
import { studioFetch, studioUpload } from '../studio/transport';
import { announceStructuredChange } from './data';
import { useManagementPage, useManagementRecord } from './management-data';
import { CategoryDialog } from './category-picker';
import { CatalogDialog, unitLabels } from './catalog-picker';
import { categoryPath, filterCatalog, searchCategories } from './tree-model';
import {
  ColumnMenu,
  ManagementFilters,
  Pager,
  SortableHeader,
  StatusTabs,
  TableSearch,
  cellClass,
  nextSort,
  tableClass,
  useColumnChoice,
  useRowFocus,
  type Column,
  type Sort,
  type Status,
} from './data-table';
import { words } from '../../lib/vocabulary';

/**
 * Turns the raw blocker counts into things a manager can act on. Only non-zero
 * reasons appear, each with somewhere to go and fix it where one exists.
 * Superseded releases are deliberately not a reason: they keep their own frozen
 * reference and never become selectable again.
 */
function blockingReasons(blockers: CategoryBlockers, workspaceId: string) {
  return [
    {
      key: 'children',
      count: blockers.activeChildren,
      label:
        blockers.activeChildren === 1
          ? `active ${words.thing} inside it`
          : `active ${words.things} inside it`,
      action: null,
      href: null,
    },
    {
      key: 'guides',
      count: blockers.assignedGuides,
      label: blockers.assignedGuides === 1 ? 'guide filed here' : 'guides filed here',
      action: 'Open guides',
      href: `/studio/${workspaceId}`,
    },
    {
      key: 'releases',
      count: blockers.currentReleases,
      label:
        blockers.currentReleases === 1
          ? 'guide whose current release is published from here'
          : 'guides whose current release is published from here',
      action: 'Open guides',
      href: `/studio/${workspaceId}`,
    },
    {
      key: 'items',
      count: blockers.activeItems,
      label: blockers.activeItems === 1 ? 'active catalog item' : 'active catalog items',
      action: 'Open catalog',
      href: `/studio/${workspaceId}/catalog`,
    },
  ].filter((reason) => reason.count > 0);
}

/**
 * Distinct guides using an item, with drafts and current releases kept apart
 * on hover: moving an item out of a draft does not change what a release
 * already froze. Counted in the database, because the union of two sets is not
 * the larger of their sizes.
 */
function Usage({ usage }: { usage?: CatalogUsageCounts }) {
  if (!usage || usage.distinctGuides === 0)
    return <span className="text-[var(--gp-semantic-text-secondary)]">—</span>;
  const parts = [
    usage.draftGuides > 0 ? `${usage.draftGuides} in drafts` : null,
    usage.publishedGuides > 0 ? `${usage.publishedGuides} published` : null,
  ].filter(Boolean);
  return (
    <span title={parts.join(' · ')} className="tabular-nums">
      {usage.distinctGuides}
    </span>
  );
}

/** Guides filed under a thing, counted once each, with where they sit. */
function guideTotal(entry?: CategoryCounts) {
  if (!entry || entry.subtree === 0) return null;
  const inside = entry.subtree - entry.direct;
  return inside === 0 ? `${entry.direct} here` : `${entry.direct} here + ${inside} inside`;
}

function StatusLabel({ inactive }: { inactive: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
        inactive
          ? 'bg-[var(--gp-semantic-surface-sunken)] text-[var(--gp-semantic-text-secondary)]'
          : 'bg-[var(--gp-semantic-status-success-background)] text-[var(--gp-semantic-status-success-foreground)]',
      )}
    >
      {inactive ? 'Inactive' : 'Active'}
    </span>
  );
}

function Visibility({ value }: { value: 'public' | 'members' }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {value === 'public' ? (
        <Globe size={14} aria-hidden="true" />
      ) : (
        <ShieldCheck size={14} aria-hidden="true" />
      )}
      {value === 'public' ? 'Public' : 'Members'}
    </span>
  );
}

function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="my-6 grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map(([term, detail]) => (
        <div key={term}>
          <dt className="text-xs font-semibold tracking-wide text-[var(--gp-semantic-text-secondary)] uppercase">
            {term}
          </dt>
          <dd className="m-0 mt-1">{detail}</dd>
        </div>
      ))}
    </dl>
  );
}

function ManagementHeading({
  workspace,
  active,
  title,
  lede,
}: {
  workspace: StudioWorkspace;
  active: 'things' | 'catalog';
  title: string;
  lede: string;
}) {
  return (
    <>
      <div className={X.pageHeading}>
        <StudioTrail workspace={workspace} section="Manage" />
        <h1>{title}</h1>
        <p>{lede}</p>
      </div>
      <ManageTabs workspace={workspace} active={active} />
    </>
  );
}

const toolbarClass = 'mb-5 flex flex-wrap items-center gap-3';
const noticeClass =
  'mb-5 rounded-[var(--gp-semantic-radius-control)] bg-[var(--gp-semantic-status-success-background)] px-4 py-3 text-sm text-[var(--gp-semantic-status-success-foreground)]';
const panelClass =
  'overflow-x-auto rounded-[var(--gp-semantic-radius-panel)] border border-[var(--gp-semantic-border-subtle)] bg-[var(--gp-semantic-surface-raised)]';
const openRowClass =
  'text-start font-semibold text-[var(--gp-semantic-text-primary)] underline-offset-4 hover:underline';

/**
 * The picture shown for a thing.
 *
 * Uploading reuses the media route, so the bytes are re-encoded and stripped of
 * camera metadata on the way in exactly as a step photograph is. Which picture
 * a thing shows is recorded separately; who may see it is never decided here —
 * an asset is readable exactly as far as the thing it belongs to is, and that
 * rule lives in the database.
 */
function ThingPicture({
  workspaceId,
  category,
  onChanged,
}: {
  workspaceId: string;
  category: Category;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  async function choose(file: File) {
    setBusy(true);
    setError('');
    setProgress(0);
    try {
      const uploaded = await studioUpload<{ asset: { id: string } }>(
        `/api/studio/${workspaceId}/assets`,
        file,
        setProgress,
      );
      await studioFetch(`/api/studio/${workspaceId}/categories/${category.id}/image`, {
        method: 'PUT',
        body: JSON.stringify({ assetId: uploaded.asset.id }),
      });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That picture could not be added.');
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function clear() {
    setBusy(true);
    setError('');
    try {
      await studioFetch(`/api/studio/${workspaceId}/categories/${category.id}/image`, {
        method: 'PUT',
        body: JSON.stringify({ assetId: null }),
      });
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That picture could not be removed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={S.thingPicture}>
      {category.imageAssetId ? (
        <img
          src={`/api/media/${workspaceId}/${category.imageAssetId}?w=400`}
          alt=""
          className={S.thingImage}
        />
      ) : (
        <span className={S.detailIcon}>
          <FolderTree size={28} />
        </span>
      )}
      <div className={S.pictureActions}>
        {busy ? (
          <label>
            Adding
            <progress value={progress} max={1} />
          </label>
        ) : (
          <>
            <label className={X.pictureAddParts}>
              <span>{category.imageAssetId ? 'Replace picture' : 'Add a picture'}</span>
              <input
                ref={fileInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void choose(file);
                }}
              />
            </label>
            {category.imageAssetId && (
              <Button type="button" variant="ghost" onClick={() => void clear()}>
                Remove
              </Button>
            )}
          </>
        )}
      </div>
      {error && <ErrorNotice error={error} />}
    </div>
  );
}

export function CategoryManagementPage({ workspaceId }: { workspaceId: string }) {
  return (
    <SessionGate workspaceId={workspaceId}>
      {(_, workspace) => <ThingsManagement workspace={workspace!} />}
    </SessionGate>
  );
}

const thingColumns = (counts: Map<string, CategoryCounts>): Column<Category>[] => [
  { key: 'name', header: 'Name', primary: true, sortValue: (c) => c.name, cell: () => null },
  {
    // The support code: stable and never recycled, so it is what people quote
    // to each other and to support. Shown unless the viewer hides it.
    key: 'code',
    header: 'Code',
    sortValue: (c) => c.code,
    cell: (c) => <code>{c.code}</code>,
  },
  {
    key: 'guides',
    header: 'Guides',
    align: 'end',
    sortValue: (c) => counts.get(c.id)?.subtree ?? 0,
    cell: (c) => {
      const entry = counts.get(c.id);
      return entry?.subtree ? (
        <span title={guideTotal(entry) ?? undefined} className="tabular-nums">
          {entry.subtree}
        </span>
      ) : (
        <span className="text-[var(--gp-semantic-text-secondary)]">—</span>
      );
    },
  },
  {
    key: 'published',
    header: 'Published',
    align: 'end',
    sortValue: (c) => counts.get(c.id)?.publishedSubtree ?? 0,
    cell: (c) => {
      const published = counts.get(c.id)?.publishedSubtree ?? 0;
      return published ? (
        <span className="tabular-nums">{published}</span>
      ) : (
        <span className="text-[var(--gp-semantic-text-secondary)]">—</span>
      );
    },
  },
  {
    key: 'visibility',
    header: 'Visible to',
    sortValue: (c) => c.visibility,
    cell: (c) => <Visibility value={c.visibility} />,
  },
  {
    key: 'status',
    header: 'Status',
    sortValue: (c) => (c.archived ? 1 : 0),
    cell: (c) => <StatusLabel inactive={c.archived} />,
  },
];

function ThingsManagement({ workspace }: { workspace: StudioWorkspace }) {
  const domain: Category['domain'] = 'guide';
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>('active');
  const [visibility, setVisibility] = useState<'all' | 'public' | 'members'>('all');
  const [usageFilter, setUsageFilter] = useState<'all' | 'used' | 'unused'>('all');
  const [sort, setSort] = useState<Sort>(null);
  const [page, setPage] = useState(1);
  const [placing, setPlacing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selectedRecord, setSelected] = useState<Category | null>(null);
  const [addingInside, setAddingInside] = useState<Category | null>(null);
  const [notice, setNotice] = useState('');
  const owner = workspace.role === 'manage';
  const searching = query.trim() !== '';
  const { data, error, loading, refresh } = useManagementPage<CategoryPage>(
    workspace.id,
    'categories',
    {
      search: query,
      status,
      visibility,
      usage: usageFilter,
      sort,
      page,
      expanded,
      collapsed,
      reveal: placing,
    },
  );
  const categories = data?.categories ?? [];
  const countsById = useMemo(
    () => new Map(data?.counts.map((entry) => [entry.categoryId, entry]) ?? []),
    [data],
  );
  const columns = useMemo(() => thingColumns(countsById), [countsById]);
  const { shown, visible, toggle } = useColumnChoice('things', columns);
  const rows = data?.rows ?? [];
  const statusCounts = data?.statusCounts ?? { all: 0, active: 0, inactive: 0 };
  const selected = useManagementRecord(workspace.id, 'categories', selectedRecord);
  const selectedId = selected?.id;
  useEffect(() => {
    if (!loading && !error && data) {
      setPage(data.page);
      setPlacing(null);
    }
  }, [data, loading, error]);
  function changeQuestion(change: () => void) {
    setPage(1);
    setPlacing(null);
    change();
  }
  const focus = useRowFocus(
    rows.map((row) => row.category.id),
    {
      fallback: () => document.getElementById('things-search'),
      paused: Boolean(selectedId || addingInside),
    },
  );

  function open(category: Category) {
    focus.opened(category.id);
    setSelected(category);
  }
  /**
   * Show a thing that was just added, and move to it.
   *
   * Adding stays in the table rather than opening the new record, so adding
   * several in a row is several presses rather than a sheet to close each
   * time. A thing added inside a closed branch opens the branch, and a search
   * or status that would hide it is cleared, because one that does not appear
   * reads as a creation that failed.
   */
  function reveal(category: Category) {
    const ancestors = category.path.slice(0, -1).map((node) => node.id);
    setExpanded((current) => new Set([...current, ...ancestors]));
    setCollapsed((current) => new Set([...current].filter((id) => !ancestors.includes(id))));
    if (searching && !searchCategories([category], query).length) setQuery('');
    if (status === 'inactive') setStatus('active');
    if (visibility !== 'all' && visibility !== category.visibility) setVisibility('all');
    if (usageFilter === 'used') setUsageFilter('all');
    setPlacing(category.id);
    focus.focusWhenShown(category.id);
  }
  function toggleRow(category: Category) {
    const flip = (current: Set<string>) => {
      const next = new Set(current);
      if (next.has(category.id)) next.delete(category.id);
      else next.add(category.id);
      return next;
    };
    setPlacing(null);
    if (searching) setCollapsed(flip);
    else setExpanded(flip);
  }

  return (
    <main className={cn(X.container, S.management)} id="main" tabIndex={-1}>
      <ManagementHeading
        workspace={workspace}
        active="things"
        title="Everything you write about."
        lede={`The ${words.things} your guides are about — a bicycle, a fridge, a production line.`}
      />
      <div className={toolbarClass}>
        <TableSearch
          id="things-search"
          label={`Search ${words.things}`}
          placeholder={`Find a ${words.thing} or path…`}
          value={query}
          onChange={(value) =>
            changeQuestion(() => {
              setQuery(value);
              setCollapsed(new Set());
            })
          }
        />
        <StatusTabs
          label="Status"
          value={status}
          counts={statusCounts}
          onChange={(value) => changeQuestion(() => setStatus(value))}
        />
        <ColumnMenu columns={columns} visible={visible} onToggle={toggle} />
        {owner && (
          <CategoryDialog
            key={`new-${domain}`}
            workspace={workspace}
            domain={domain}
            trigger={
              <Button type="button">
                <FolderPlus size={17} />
                Add a {words.thing}
              </Button>
            }
            onSaved={(category) => {
              reveal(category);
              setNotice(`${category.name} added.`);
            }}
          />
        )}
      </div>
      <ManagementFilters
        visibility={visibility}
        usage={usageFilter}
        onVisibility={(value) => changeQuestion(() => setVisibility(value))}
        onUsage={(value) => changeQuestion(() => setUsageFilter(value))}
        onClear={() =>
          changeQuestion(() => {
            setQuery('');
            setStatus('active');
            setVisibility('all');
            setUsageFilter('all');
            setCollapsed(new Set());
          })
        }
        active={Boolean(
          query || status !== 'active' || visibility !== 'all' || usageFilter !== 'all',
        )}
      />
      <p role="status" className={S.count}>
        {loading ? 'Updating things…' : `${statusCounts[status]} matching things`}
      </p>
      {notice && (
        <p className={noticeClass} role="status">
          {notice}
        </p>
      )}
      {!owner && (
        <p className={S.notice}>
          You can look through these. Someone who manages this workspace can change them.
        </p>
      )}
      {error ? (
        <>
          <ErrorNotice error={error} />
          <Button type="button" variant="secondary" onClick={refresh}>
            Try again
          </Button>
        </>
      ) : loading && !categories.length ? (
        <p role="status">Loading…</p>
      ) : !rows.length ? (
        <div className={S.empty}>
          <FolderTree size={36} />
          {!query && status === 'active' && visibility === 'all' && usageFilter === 'all' ? (
            <>
              <h2>Nothing here yet</h2>
              <p>Add the first {words.thing} your guides are about.</p>
            </>
          ) : (
            <>
              <h2>Nothing matches</h2>
              <p>Try a different search, or choose All.</p>
            </>
          )}
        </div>
      ) : (
        <div className={panelClass} aria-busy={loading}>
          <table className={tableClass} aria-label={words.Things}>
            <thead>
              <tr>
                {shown.map((column) => (
                  <SortableHeader
                    key={column.key}
                    column={column}
                    sort={sort}
                    onSort={(key) => changeQuestion(() => setSort(nextSort(sort, key)))}
                  />
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(({ category, depth, context, hasChildren, expanded: isOpen }) => (
                <tr
                  key={category.id}
                  className={cn(
                    'group cursor-pointer hover:bg-[var(--gp-semantic-surface-sunken)]',
                    context && 'text-[var(--gp-semantic-text-secondary)]',
                  )}
                  onClick={() => open(category)}
                >
                  {shown.map((column) =>
                    column.primary ? (
                      <th key={column.key} scope="row" className={cn(cellClass, 'font-normal')}>
                        <div
                          className="flex items-center gap-2"
                          style={{ paddingInlineStart: depth * 24 }}
                        >
                          {hasChildren && !context ? (
                            <button
                              type="button"
                              aria-expanded={isOpen}
                              aria-label={`${isOpen ? 'Hide' : 'Show'} what is inside ${category.name}`}
                              className="grid size-7 shrink-0 place-items-center rounded-md border border-[var(--gp-semantic-border-control)] hover:bg-[var(--gp-semantic-surface-raised)]"
                              onClick={(event) => {
                                event.stopPropagation();
                                toggleRow(category);
                              }}
                            >
                              {isOpen ? <Minus size={14} /> : <Plus size={14} />}
                            </button>
                          ) : (
                            <span className="size-7 shrink-0" aria-hidden="true" />
                          )}
                          {category.imageAssetId ? (
                            <img
                              src={`/api/media/${workspace.id}/${category.imageAssetId}?w=400`}
                              alt=""
                              className="size-8 shrink-0 rounded-md object-cover"
                            />
                          ) : (
                            <FolderTree
                              size={18}
                              aria-hidden="true"
                              className="mx-[7px] shrink-0 text-[var(--gp-semantic-text-secondary)]"
                            />
                          )}
                          <button
                            type="button"
                            ref={focus.register(category.id)}
                            className={cn(openRowClass, context && 'font-normal')}
                            onClick={(event) => {
                              event.stopPropagation();
                              open(category);
                            }}
                          >
                            {category.name}
                          </button>
                          {context && (
                            <span className="text-xs whitespace-nowrap">contains matches</span>
                          )}
                          {owner && !category.archived && (
                            <button
                              type="button"
                              aria-label={`Add a ${words.thing} inside ${category.name}`}
                              title={`Add a ${words.thing} inside ${category.name}`}
                              className="ms-auto grid size-7 shrink-0 place-items-center rounded-md text-[var(--gp-semantic-text-secondary)] opacity-0 group-hover:opacity-100 hover:bg-[var(--gp-semantic-surface-raised)] hover:text-[var(--gp-semantic-text-primary)] focus-visible:opacity-100"
                              onClick={(event) => {
                                event.stopPropagation();
                                setAddingInside(category);
                              }}
                            >
                              <Plus size={15} />
                            </button>
                          )}
                        </div>
                      </th>
                    ) : (
                      <td
                        key={column.key}
                        className={cn(cellClass, column.align === 'end' && 'text-end')}
                      >
                        {column.cell(category)}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data && (
        <Pager
          loading={loading}
          page={data.page}
          pageSize={data.pageSize}
          total={data.total}
          noun={['row', 'rows']}
          onPage={(next) => {
            setPlacing(null);
            setPage(next);
          }}
        />
      )}
      {data && data.total > data.pageSize && (
        <p className="mt-2 text-xs text-muted">
          Pages follow the visible tree. Ancestors may repeat to show where a branch belongs.
        </p>
      )}
      {/* Driven by the row that was pressed, so nothing asks where the new one
          should go. */}
      {addingInside && (
        <CategoryDialog
          key={`inside-${addingInside.id}`}
          workspace={workspace}
          domain={domain}
          initialParent={addingInside.id}
          open
          onOpenChange={(next) => {
            if (!next) setAddingInside(null);
          }}
          onSaved={(category) => {
            setNotice(`${category.name} added inside ${addingInside.name}.`);
            setAddingInside(null);
            reveal(category);
          }}
        />
      )}
      {selected && (
        <Dialog
          size="sheet"
          open
          onOpenChange={(next) => {
            if (!next) setSelected(null);
          }}
          onCloseAutoFocus={focus.restore}
          title={selected.name}
          description={categoryPath(selected)}
        >
          <ThingDetail
            key={`${selected.id}-${selected.version}`}
            workspace={workspace}
            category={selected}
            counts={countsById.get(selected.id)}
            onRefresh={() => announceStructuredChange(workspace.id)}
            onAdded={(category) => {
              setNotice(`${category.name} added inside ${selected.name}.`);
              reveal(category);
            }}
            onChanged={(message, close) => {
              setNotice(message);
              if (close) setSelected(null);
            }}
          />
        </Dialog>
      )}
    </main>
  );
}

function ThingDetail({
  workspace,
  category,
  counts,
  onRefresh,
  onAdded,
  onChanged,
}: {
  workspace: StudioWorkspace;
  category: Category;
  counts?: CategoryCounts;
  onRefresh: () => void;
  onAdded: (category: Category) => void;
  onChanged: (message: string, close: boolean) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState('');
  const [blockers, setBlockers] = useState<CategoryBlockers | null>(null);
  const [recordCounts, setRecordCounts] = useState(counts);
  const [countsError, setCountsError] = useState(false);
  const [blockersLoading, setBlockersLoading] = useState(false);
  const owner = workspace.role === 'manage';
  useEffect(() => {
    let active = true;
    setBlockersLoading(true);
    setCountsError(false);
    studioFetch<{ blockers: CategoryBlockers; counts: CategoryCounts }>(
      `/api/studio/${workspace.id}/categories/${category.id}?blockers=true&counts=true`,
    )
      .then((result) => {
        if (active) {
          setBlockers(result.blockers);
          setRecordCounts(result.counts);
        }
      })
      .catch(() => {
        // Falls back to letting the server refuse and explain.
        if (active) {
          setBlockers(null);
          setCountsError(true);
        }
      })
      .finally(() => {
        if (active) setBlockersLoading(false);
      });
    return () => {
      active = false;
    };
  }, [confirming, category.version, category.id, workspace.id]);
  const reasons = blockers ? blockingReasons(blockers, workspace.id) : [];

  async function changeStatus() {
    setPending(true);
    setActionError('');
    try {
      await studioFetch(`/api/studio/${workspace.id}/categories/${category.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          domain: category.domain,
          parentId: category.parentId,
          name: category.name,
          description: category.description,
          visibility: category.visibility,
          sortOrder: category.sortOrder,
          expectedVersion: category.version,
          archived: !category.archived,
        }),
      });
      setConfirming(false);
      announceStructuredChange(workspace.id);
      onChanged(
        category.archived
          ? `${category.name} is active again.`
          : `${category.name} is inactive. Nothing was deleted.`,
        true,
      );
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : `Unable to change this ${words.thing}.`,
      );
    } finally {
      setPending(false);
    }
  }

  const inside = blockers?.activeChildren;
  return (
    <>
      <ThingPicture workspaceId={workspace.id} category={category} onChanged={onRefresh} />
      <p className="mt-4">{category.description || 'No description yet.'}</p>
      <Facts
        items={[
          ['Code', <code key="code">{category.code}</code>],
          ['Status', <StatusLabel key="status" inactive={category.archived} />],
          ['Visible to', <Visibility key="visibility" value={category.visibility} />],
          ['Version', category.version],
          [
            'Guides',
            recordCounts
              ? recordCounts.subtree
                ? `${recordCounts.subtree} — ${guideTotal(recordCounts)}`
                : 'None filed here yet'
              : countsError
                ? 'Unavailable'
                : 'Loading…',
          ],
          [
            'Published',
            recordCounts
              ? recordCounts.publishedSubtree
                ? `${recordCounts.publishedSubtree} current`
                : 'None published yet'
              : countsError
                ? 'Unavailable'
                : 'Loading…',
          ],
          [
            `Directly inside`,
            inside === undefined ? 'Loading…' : inside ? `${inside} active` : 'Nothing yet',
          ],
        ]}
      />
      {owner && (
        <div className="flex flex-wrap gap-2.5">
          {!category.archived && (
            <CategoryDialog
              key={`child-${category.id}`}
              workspace={workspace}
              domain={category.domain}
              initialParent={category.id}
              trigger={
                <Button type="button">
                  <Plus size={16} />
                  Add one inside
                </Button>
              }
              onSaved={onAdded}
            />
          )}
          <CategoryDialog
            key={`edit-${category.id}-${category.version}`}
            workspace={workspace}
            domain={category.domain}
            initial={category}
            trigger={
              <Button type="button" variant="secondary">
                <Pencil size={15} />
                Edit or move
              </Button>
            }
            onSaved={() => onChanged(`${category.name} saved. Its identity is unchanged.`, false)}
          />
          <Dialog
            trigger={
              <Button type="button" variant="secondary">
                {category.archived ? <RotateCcw size={15} /> : <Archive size={15} />}{' '}
                {category.archived ? 'Reactivate' : 'Deactivate'}
              </Button>
            }
            title={
              category.archived
                ? `Reactivate this ${words.thing}`
                : `Deactivate this ${words.thing}`
            }
            description={
              category.archived
                ? 'It becomes available to choose again.'
                : `Deactivating keeps every record. Active ${words.things} inside it, guides filed here, current releases and active catalog items must move first; superseded releases keep their own reference and do not block this.`
            }
            open={confirming}
            onOpenChange={(next) => {
              if (!pending) {
                setConfirming(next);
                setActionError('');
              }
            }}
            closeDisabled={pending}
          >
            <div className={S.form}>
              <p>
                <strong>{categoryPath(category)}</strong>
              </p>
              {!category.archived && blockersLoading && (
                <p role="status">Checking what still uses it…</p>
              )}
              {!category.archived && reasons.length > 0 && (
                <div className={S.blockers}>
                  <p>
                    <strong>Move these first.</strong> Nothing is deleted; each of these still
                    points here.
                  </p>
                  <ul>
                    {reasons.map((reason) => (
                      <li key={reason.key}>
                        <span className={S.blockerCount}>{reason.count}</span>
                        {reason.label}
                        {reason.href && <a href={reason.href}>{reason.action}</a>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {actionError && <ErrorNotice error={actionError} />}
              <div className={S.formActions}>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setConfirming(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={
                    pending || (!category.archived && (blockersLoading || reasons.length > 0))
                  }
                  onClick={() => void changeStatus()}
                >
                  {pending ? 'Saving…' : category.archived ? 'Reactivate' : 'Deactivate'}
                </Button>
              </div>
            </div>
          </Dialog>
        </div>
      )}
    </>
  );
}

export function CatalogManagementPage({ workspaceId }: { workspaceId: string }) {
  return (
    <SessionGate workspaceId={workspaceId}>
      {(_, workspace) => <CatalogManagement workspace={workspace!} />}
    </SessionGate>
  );
}

const catalogColumns = (usage: Map<string, CatalogUsageCounts>): Column<CatalogItem>[] => {
  const optional = (value: string) =>
    value || <span className="text-[var(--gp-semantic-text-secondary)]">—</span>;
  return [
    { key: 'name', header: 'Name', primary: true, sortValue: (i) => i.name, cell: () => null },
    {
      key: 'specification',
      header: 'Specification',
      sortValue: (i) => i.specification,
      cell: (i) => optional(i.specification),
    },
    {
      key: 'partNumber',
      header: 'Part number',
      sortValue: (i) => i.partNumber,
      cell: (i) => (i.partNumber ? <code>{i.partNumber}</code> : optional('')),
    },
    {
      key: 'manufacturer',
      header: 'Manufacturer',
      hiddenByDefault: true,
      sortValue: (i) => i.manufacturer,
      cell: (i) => optional(i.manufacturer),
    },
    {
      key: 'model',
      header: 'Model',
      hiddenByDefault: true,
      sortValue: (i) => i.model,
      cell: (i) => optional(i.model),
    },
    {
      key: 'unit',
      header: 'Unit',
      hiddenByDefault: true,
      sortValue: (i) => unitLabels[i.defaultUnit],
      cell: (i) => unitLabels[i.defaultUnit],
    },
    {
      key: 'visibility',
      header: 'Visible to',
      hiddenByDefault: true,
      sortValue: (i) => i.visibility,
      cell: (i) => <Visibility value={i.visibility} />,
    },
    {
      key: 'guides',
      header: 'Guides',
      align: 'end',
      sortValue: (i) => usage.get(i.id)?.distinctGuides ?? 0,
      cell: (i) => <Usage usage={usage.get(i.id)} />,
    },
    {
      key: 'status',
      header: 'Status',
      sortValue: (i) => (i.archived ? 1 : 0),
      cell: (i) => <StatusLabel inactive={i.archived} />,
    },
  ];
};

const catalogPageSize = 25;

function CatalogManagement({ workspace }: { workspace: StudioWorkspace }) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Status>('active');
  const [visibility, setVisibility] = useState<'all' | 'public' | 'members'>('all');
  const [usageFilter, setUsageFilter] = useState<'all' | 'used' | 'unused'>('all');
  const [sort, setSort] = useState<Sort>({ key: 'name', direction: 'ascending' });
  const [page, setPage] = useState(1);
  const [selectedRecord, setSelected] = useState<CatalogItem | null>(null);
  const [notice, setNotice] = useState('');
  const [placing, setPlacing] = useState<string | null>(null);
  const owner = workspace.role === 'manage';
  const { data, error, loading, refresh } = useManagementPage<CatalogPage>(
    workspace.id,
    'catalog',
    {
      search,
      status,
      visibility,
      usage: usageFilter,
      sort,
      page,
      reveal: placing,
    },
  );
  const items = data?.items ?? [];
  const shownRows = items;
  const usageById = useMemo(
    () => new Map(data?.usage.map((entry) => [entry.itemId, entry]) ?? []),
    [data],
  );
  const columns = useMemo(() => catalogColumns(usageById), [usageById]);
  const { shown, visible, toggle } = useColumnChoice('catalog', columns);
  const statusCounts = data?.statusCounts ?? { all: 0, active: 0, inactive: 0 };
  const selected = useManagementRecord(workspace.id, 'catalog', selectedRecord);
  const selectedId = selected?.id;
  useEffect(() => {
    if (!loading && !error && data) {
      setPage(data.page);
      setPlacing(null);
    }
  }, [data, loading, error]);
  function changeQuestion(change: () => void) {
    setPage(1);
    setPlacing(null);
    change();
  }
  const focus = useRowFocus(
    shownRows.map((item) => item.id),
    { fallback: () => document.getElementById('catalog-search'), paused: Boolean(selectedId) },
  );

  function open(item: CatalogItem) {
    focus.opened(item.id);
    setSelected(item);
  }
  /**
   * A new item opens straight away. Behind it, the table clears a search or
   * status that would hide it and turns to its page, so closing the record
   * lands on its row rather than on a table that does not contain it.
   */
  function place(item: CatalogItem) {
    if (filterCatalog([item], { search, includeArchived: false }).length === 0) setSearch('');
    if (status === 'inactive') setStatus('active');
    if (visibility !== 'all' && visibility !== item.visibility) setVisibility('all');
    if (usageFilter === 'used') setUsageFilter('all');
    setPlacing(item.id);
    focus.focusWhenShown(item.id);
    open(item);
  }

  return (
    <main className={cn(X.container, S.management)} id="main" tabIndex={-1}>
      <ManagementHeading
        workspace={workspace}
        active="catalog"
        title="What your guides call for."
        lede="Tools, materials and parts, each recorded once and reused by every guide that needs it."
      />
      <div className={toolbarClass}>
        <TableSearch
          id="catalog-search"
          label="Search catalog"
          placeholder="Find names, sizes, models or part numbers…"
          value={search}
          onChange={(value) => changeQuestion(() => setSearch(value))}
        />
        <StatusTabs
          label="Status"
          value={status}
          counts={statusCounts}
          onChange={(value) => changeQuestion(() => setStatus(value))}
        />
        <ColumnMenu columns={columns} visible={visible} onToggle={toggle} />
        {owner && (
          <CatalogDialog
            workspace={workspace}
            initialName={search}
            trigger={
              <Button type="button">
                <Plus size={17} />
                New catalog item
              </Button>
            }
            onSaved={(item) => {
              place(item);
              setNotice(`${item.name} added to the catalog.`);
            }}
          />
        )}
      </div>
      <ManagementFilters
        visibility={visibility}
        usage={usageFilter}
        onVisibility={(value) => changeQuestion(() => setVisibility(value))}
        onUsage={(value) => changeQuestion(() => setUsageFilter(value))}
        onClear={() =>
          changeQuestion(() => {
            setSearch('');
            setStatus('active');
            setVisibility('all');
            setUsageFilter('all');
          })
        }
        active={Boolean(
          search || status !== 'active' || visibility !== 'all' || usageFilter !== 'all',
        )}
      />

      {notice && (
        <p className={noticeClass} role="status">
          {notice}
        </p>
      )}
      <p className={S.count} role="status">
        {loading
          ? 'Loading catalog…'
          : `${data?.total ?? 0} ${data?.total === 1 ? 'item' : 'items'}`}
      </p>
      {error ? (
        <>
          <ErrorNotice error={error} />
          <Button type="button" variant="secondary" onClick={refresh}>
            Try again
          </Button>
        </>
      ) : loading && !items.length ? null : !items.length ? (
        <div className={S.empty}>
          <Package size={36} />
          {/* An empty catalog and an over-narrow search are different situations,
              and suggesting a different search to somebody with nothing yet reads
              as a failure rather than a beginning. */}
          {!search && status === 'active' && visibility === 'all' && usageFilter === 'all' ? (
            <>
              <h2>Nothing here yet</h2>
              <p>
                This is where the tools, materials and parts your guides call for will live, once
                you add one.
              </p>
            </>
          ) : (
            <>
              <h2>Nothing matches</h2>
              <p>Try a different search, or choose All.</p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className={panelClass} aria-busy={loading}>
            <table className={tableClass} aria-label="Catalog items">
              <thead>
                <tr>
                  {shown.map((column) => (
                    <SortableHeader
                      key={column.key}
                      column={column}
                      sort={sort}
                      onSort={(key) => changeQuestion(() => setSort(nextSort(sort, key)))}
                    />
                  ))}
                </tr>
              </thead>
              <tbody>
                {shownRows.map((item) => (
                  <tr
                    key={item.id}
                    className="cursor-pointer hover:bg-[var(--gp-semantic-surface-sunken)]"
                    onClick={() => open(item)}
                  >
                    {shown.map((column) =>
                      column.primary ? (
                        <th key={column.key} scope="row" className={cn(cellClass, 'font-normal')}>
                          <span className="flex items-center gap-3">
                            <Package
                              size={18}
                              aria-hidden="true"
                              className="shrink-0 text-[var(--gp-semantic-text-secondary)]"
                            />
                            <button
                              type="button"
                              ref={focus.register(item.id)}
                              className={openRowClass}
                              onClick={(event) => {
                                event.stopPropagation();
                                open(item);
                              }}
                            >
                              {item.name}
                            </button>
                          </span>
                        </th>
                      ) : (
                        <td
                          key={column.key}
                          className={cn(cellClass, column.align === 'end' && 'text-end')}
                        >
                          {column.cell(item)}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pager
            loading={loading}
            page={data?.page ?? 1}
            pageSize={catalogPageSize}
            total={data?.total ?? 0}
            noun={['item', 'items']}
            onPage={(next) => {
              setPlacing(null);
              setPage(next);
            }}
          />
        </>
      )}
      {selected && (
        <Dialog
          size="sheet"
          open
          onOpenChange={(next) => {
            if (!next) setSelected(null);
          }}
          onCloseAutoFocus={focus.restore}
          title={selected.name}
          description={selected.specification || 'No specification recorded.'}
        >
          <CatalogDetail
            key={`${selected.id}-${selected.version}`}
            workspace={workspace}
            item={selected}
            onChanged={(message, close) => {
              setNotice(message);
              if (close) setSelected(null);
            }}
          />
        </Dialog>
      )}
    </main>
  );
}

function CatalogDetail({
  workspace,
  item,
  onChanged,
}: {
  workspace: StudioWorkspace;
  item: CatalogItem;
  onChanged: (message: string, close: boolean) => void;
}) {
  const [usage, setUsage] =
    useState<{ id: string; title: string; audience: string; currentRelease: number | null }[]>();
  const [usageError, setUsageError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    studioFetch<{ guides: NonNullable<typeof usage> }>(
      `/api/studio/${workspace.id}/catalog/${item.id}/usage`,
    )
      .then((result) => {
        if (active) setUsage(result.guides);
      })
      .catch((error) => {
        if (active) setUsageError(error.message);
      });
    return () => {
      active = false;
    };
  }, [workspace.id, item.id]);
  async function changeStatus() {
    setPending(true);
    setError('');
    try {
      await studioFetch(`/api/studio/${workspace.id}/catalog/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: item.name,
          specification: item.specification,
          description: item.description,
          manufacturer: item.manufacturer,
          model: item.model,
          partNumber: item.partNumber,
          defaultUnit: item.defaultUnit,
          visibility: item.visibility,
          expectedVersion: item.version,
          archived: !item.archived,
        }),
      });
      announceStructuredChange(workspace.id);
      setConfirming(false);
      onChanged(
        item.archived
          ? `${item.name} is active again.`
          : `${item.name} is inactive. Existing guide requirements remain readable.`,
        true,
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to change this item.');
    } finally {
      setPending(false);
    }
  }
  return (
    <>
      <p>{item.description || 'No description yet.'}</p>
      <Facts
        items={[
          ['Status', <StatusLabel key="status" inactive={item.archived} />],
          ['Visible to', <Visibility key="visibility" value={item.visibility} />],
          ['Default unit', unitLabels[item.defaultUnit]],
          ['Part number', item.partNumber || '—'],
          ['Manufacturer', item.manufacturer || '—'],
          ['Model', item.model || '—'],
        ]}
      />
      <section className={S.usage} aria-label="Used in guides">
        <h3>Used in guides</h3>
        {usageError ? (
          <ErrorNotice error={usageError} />
        ) : !usage ? (
          <p role="status">Checking usage…</p>
        ) : usage.length ? (
          <ul>
            {usage.map((guide) => (
              <li key={guide.id}>
                <a href={`/studio/${workspace.id}/${guide.id}`}>{guide.title}</a>
                <small>{guide.currentRelease ? 'Published' : 'Draft'}</small>
              </li>
            ))}
          </ul>
        ) : (
          <p>This item is ready for its first guide.</p>
        )}
      </section>
      {workspace.role === 'manage' && (
        <div className="mt-6 flex flex-wrap gap-2.5">
          <CatalogDialog
            workspace={workspace}
            initial={item}
            trigger={
              <Button type="button">
                <Pencil size={15} />
                Edit item
              </Button>
            }
            onSaved={() =>
              onChanged(
                `${item.name} saved. Published requirements keep their previous details.`,
                false,
              )
            }
          />
          <Dialog
            trigger={
              <Button type="button" variant="secondary">
                {item.archived ? <RotateCcw size={15} /> : <Archive size={15} />}{' '}
                {item.archived ? 'Reactivate' : 'Deactivate'}
              </Button>
            }
            title={item.archived ? 'Reactivate this item' : 'Deactivate this item'}
            description={
              item.archived
                ? 'It can be chosen for new requirements again.'
                : 'Inactive items are no longer offered for new requirements. Existing draft and published requirements keep their saved details.'
            }
            open={confirming}
            onOpenChange={(next) => {
              if (!pending) setConfirming(next);
            }}
            closeDisabled={pending}
          >
            <div className={S.form}>
              <p>
                <strong>{item.name}</strong> {item.specification}
              </p>
              {error && <ErrorNotice error={error} />}
              <div className={S.formActions}>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => setConfirming(false)}
                >
                  Cancel
                </Button>
                <Button type="button" disabled={pending} onClick={() => void changeStatus()}>
                  {pending ? 'Saving…' : item.archived ? 'Reactivate' : 'Deactivate'}
                </Button>
              </div>
            </div>
          </Dialog>
        </div>
      )}
    </>
  );
}
