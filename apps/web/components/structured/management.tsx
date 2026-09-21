'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  FolderPlus,
  FolderTree,
  Pencil,
  Plus,
  Search,
  Package,
  Wrench,
  RotateCcw,
  ShieldCheck,
  Globe,
} from 'lucide-react';
import { Button, Dialog } from '@guide/ui';
import type {
  Category,
  CategoryBlockers,
  CatalogItem,
  CatalogUsageCounts,
  StudioWorkspace,
} from '@guide/contracts';
import { SessionGate, ErrorNotice } from '../studio/frame';
import { studioFetch } from '../studio/transport';
import { useCategories, useCatalog, announceStructuredChange } from './data';
import { CategoryTree } from './category-tree';
import { CategoryDialog } from './category-picker';
import { CatalogDialog } from './catalog-picker';
import { categoryPath, filterCatalog, searchCategories } from './tree-model';
import './structured.css';
import { words } from '../../lib/vocabulary';
/**
 * Turns the raw blocker counts into things an owner can act on. Only non-zero
 * reasons appear, each with somewhere to go and fix it where one exists.
 * Superseded releases are deliberately not a reason: they keep their own frozen
 * category reference and never become selectable again.
 */
/**
 * Distinct guides using an item, drafts and current releases kept apart: moving
 * an item out of a draft does not change what a release already froze. Returns
 * null when nothing uses it, so unused rows stay quiet.
 */
function describeUsage(usage?: CatalogUsageCounts) {
  if (!usage || (usage.draftGuides === 0 && usage.publishedGuides === 0)) return null;
  const parts = [
    usage.draftGuides > 0 ? `${usage.draftGuides} in drafts` : null,
    usage.publishedGuides > 0 ? `${usage.publishedGuides} published` : null,
  ].filter(Boolean);
  const total = Math.max(usage.draftGuides, usage.publishedGuides);
  return (
    <small className="catalog-usage" aria-hidden="true" title={parts.join(' · ')}>
      {total} {total === 1 ? 'guide' : 'guides'}
    </small>
  );
}
function blockingReasons(blockers: CategoryBlockers, workspaceId: string) {
  return [
    {
      key: 'children',
      count: blockers.activeChildren,
      label: blockers.activeChildren === 1 ? 'active subcategory' : 'active subcategories',
      action: null,
      href: null,
    },
    {
      key: 'guides',
      count: blockers.assignedGuides,
      label: blockers.assignedGuides === 1 ? 'guide assigned here' : 'guides assigned here',
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
function ManagementHeader({
  workspace,
  active,
}: {
  workspace: StudioWorkspace;
  active: 'categories' | 'catalog';
}) {
  return (
    <>
      <a className="structured-back" href={`/studio/${workspace.id}`}>
        <ArrowLeft size={15} />
        {workspace.name} / Guides
      </a>
      <div className="structured-page-heading">
        <span className="studio-eyebrow">Workspace library</span>
        <h1>
          {active === 'categories' ? `Everything you write about.` : 'Your tools & materials.'}
        </h1>
        <p>
          {active === 'categories'
            ? `The ${words.things} your guides are about — a bicycle, a fridge, a production line.`
            : 'Keep exact tools, materials and replacement parts in one reusable catalog.'}
        </p>
      </div>
      <nav className="structured-tabs" aria-label="Workspace management">
        <a
          href={`/studio/${workspace.id}/categories`}
          aria-current={active === 'categories' ? 'page' : undefined}
        >
          <FolderTree size={17} />
          Categories
        </a>
        <a
          href={`/studio/${workspace.id}/catalog`}
          aria-current={active === 'catalog' ? 'page' : undefined}
        >
          <Wrench size={17} />
          Tools & materials
        </a>
      </nav>
    </>
  );
}
export function CategoryManagementPage({ workspaceId }: { workspaceId: string }) {
  return (
    <SessionGate workspaceId={workspaceId}>
      {(_, workspace) => <CategoryManagement workspace={workspace!} />}
    </SessionGate>
  );
}
function CategoryManagement({ workspace }: { workspace: StudioWorkspace }) {
  const { categories, counts, error, loading, refresh } = useCategories(workspace.id, undefined, {
    withCounts: true,
  });
  // One tree remains. The variable stays so the picker and the counts keep
  // their shape until the column itself is retired.
  const domain: Category['domain'] = 'guide';
  const [addingInside, setAddingInside] = useState<Category | null>(null);
  const [query, setQuery] = useState('');
  const [selectedId, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('active');
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');
  const [pending, setPending] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [blockers, setBlockers] = useState<CategoryBlockers | null>(null);
  const [blockersLoading, setBlockersLoading] = useState(false);
  const countsById = useMemo(
    () => new Map(counts.map((entry) => [entry.categoryId, entry])),
    [counts],
  );
  const archiveTargetId = archiveOpen && selectedId ? selectedId : null;
  useEffect(() => {
    if (!archiveTargetId) {
      setBlockers(null);
      return;
    }
    let active = true;
    setBlockersLoading(true);
    studioFetch<{ blockers: CategoryBlockers }>(
      `/api/studio/${workspace.id}/categories/${archiveTargetId}?blockers=true`,
    )
      .then((result) => {
        if (active) setBlockers(result.blockers);
      })
      .catch(() => {
        // Falls back to letting the server refuse and explain.
        if (active) setBlockers(null);
      })
      .finally(() => {
        if (active) setBlockersLoading(false);
      });
    return () => {
      active = false;
    };
  }, [archiveTargetId, workspace.id]);
  const inDomain = categories.filter((category) => category.domain === domain);
  // Status counts describe what the current search matches, before the selected
  // status narrows it, so All always equals Active plus Inactive.
  const matching = searchCategories(inDomain, query);
  const statusCounts = {
    active: matching.filter((category) => !category.archived).length,
    inactive: matching.filter((category) => category.archived).length,
    all: matching.length,
  };
  const visible = inDomain.filter((category) =>
    status === 'all' ? true : status === 'active' ? !category.archived : category.archived,
  );
  const selected = categories.find((category) => category.id === selectedId);
  const owner = workspace.role === 'owner';
  async function archive() {
    if (!selected) return;
    setPending(true);
    setActionError('');
    try {
      await studioFetch(`/api/studio/${workspace.id}/categories/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          domain: selected.domain,
          parentId: selected.parentId,
          name: selected.name,
          description: selected.description,
          visibility: selected.visibility,
          sortOrder: selected.sortOrder,
          expectedVersion: selected.version,
          archived: !selected.archived,
        }),
      });
      setNotice(
        selected.archived
          ? 'Category restored.'
          : 'Category archived. No guides or items were deleted.',
      );
      setArchiveOpen(false);
      setSelected(null);
      announceStructuredChange(workspace.id);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Unable to change this category.');
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="studio-container structured-management" id="main" tabIndex={-1}>
      <ManagementHeader workspace={workspace} active="categories" />
      <div className="structured-management-toolbar">
        {owner && (
          <CategoryDialog
            key={`new-${domain}`}
            workspace={workspace}
            domain={domain}
            categories={categories}
            trigger={
              <Button type="button">
                <FolderPlus size={17} />
                Add a {words.thing}
              </Button>
            }
            onSaved={(category) => {
              setSelected(category.id);
              setNotice('Category created.');
            }}
          />
        )}
      </div>
      {notice && (
        <p className="structured-success" role="status">
          {notice}
        </p>
      )}
      {!owner && (
        <p className="structured-notice">
          You can browse this workspace’s structure. An owner manages categories.
        </p>
      )}
      <div className="structured-management-grid">
        <section className="structured-tree-panel" aria-label={words.Things}>
          <div className="structured-search">
            <Search size={17} />
            <input
              aria-label="Search categories"
              placeholder="Find a category or path…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <div className="structured-status-tabs" role="group" aria-label="Category status">
            {(['all', 'active', 'inactive'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={status === option}
                onClick={() => setStatus(option)}
              >
                {option === 'all' ? 'All' : option === 'active' ? 'Active' : 'Inactive'}
                <span className="structured-status-count">{statusCounts[option]}</span>
              </button>
            ))}
          </div>
          {error ? (
            <>
              <ErrorNotice error={error} />
              <Button type="button" variant="secondary" onClick={refresh}>
                Try again
              </Button>
            </>
          ) : loading && !categories.length ? (
            <p role="status">Loading…</p>
          ) : (
            <CategoryTree
              categories={visible}
              query={query}
              value={selectedId}
              counts={countsById}
              onSelect={(category) => {
                setSelected(category.id);
                setActionError('');
              }}
              onAddChild={(category) => setAddingInside(category)}
              addChildLabel={(category) => `Add a ${words.thing} inside ${category.name}`}
            />
          )}
          {/* Driven by the row that was pressed, so there is no field asking
              where the new one should go. */}
          {addingInside && (
            <CategoryDialog
              key={`inside-${addingInside.id}`}
              workspace={workspace}
              domain={domain}
              categories={categories}
              initialParent={addingInside.id}
              open
              onOpenChange={(next) => {
                if (!next) setAddingInside(null);
              }}
              onSaved={(category) => {
                setSelected(category.id);
                setNotice(`Added inside ${addingInside.name}.`);
                setAddingInside(null);
              }}
            />
          )}
        </section>
        <section className="structured-detail-panel" aria-label="Details">
          {selected ? (
            <>
              <span className="structured-detail-icon">
                <FolderTree size={28} />
              </span>
              <p className="structured-breadcrumb">{categoryPath(selected)}</p>
              <h2>{selected.name}</h2>
              <div className="structured-inline-meta">
                <span>
                  {selected.visibility === 'public' ? (
                    <Globe size={14} />
                  ) : (
                    <ShieldCheck size={14} />
                  )}{' '}
                  {selected.visibility === 'public' ? 'Public' : 'Workspace members'}
                </span>
                <span>{selected.archived ? 'Inactive' : 'Active'}</span>
                <span>Version {selected.version}</span>
              </div>
              <p>{selected.description || 'No description yet.'}</p>
              <dl className="structured-facts">
                <div>
                  <dt>Guides</dt>
                  <dd>
                    {(() => {
                      const entry = countsById.get(selected.id);
                      if (!entry || entry.subtree === 0) return 'None assigned yet';
                      const nested = entry.subtree - entry.direct;
                      return nested === 0
                        ? `${entry.subtree} here`
                        : `${entry.subtree} total — ${entry.direct} here + ${nested} in subcategories`;
                    })()}
                  </dd>
                </div>
                <div>
                  <dt>Published releases</dt>
                  <dd>
                    {countsById.get(selected.id)?.publishedSubtree
                      ? `${countsById.get(selected.id)!.publishedSubtree} current`
                      : 'None published yet'}
                  </dd>
                </div>
                <div>
                  <dt>Direct subcategories</dt>
                  <dd>
                    {
                      categories.filter(
                        (category) => category.parentId === selected.id && !category.archived,
                      ).length
                    }
                  </dd>
                </div>
              </dl>
              {owner && (
                <div className="structured-detail-actions">
                  {!selected.archived && (
                    <CategoryDialog
                      key={`child-${selected.id}`}
                      workspace={workspace}
                      domain={domain}
                      categories={categories}
                      initialParent={selected.id}
                      trigger={
                        <Button type="button">
                          <Plus size={16} />
                          Add one inside
                        </Button>
                      }
                      onSaved={(category) => {
                        setSelected(category.id);
                        setNotice(`Added inside ${selected.name}.`);
                      }}
                    />
                  )}
                  <CategoryDialog
                    key={`edit-${selected.id}-${selected.version}`}
                    workspace={workspace}
                    domain={domain}
                    categories={categories}
                    initial={selected}
                    trigger={
                      <Button type="button" variant="secondary">
                        <Pencil size={15} />
                        Edit or move
                      </Button>
                    }
                    onSaved={() => setNotice('Category updated. Its identity is unchanged.')}
                  />
                  <Dialog
                    trigger={
                      <Button type="button" variant="secondary">
                        {selected.archived ? <RotateCcw size={15} /> : <Archive size={15} />}{' '}
                        {selected.archived ? 'Restore' : 'Archive'}
                      </Button>
                    }
                    title={selected.archived ? 'Restore category' : 'Archive category'}
                    description={
                      selected.archived
                        ? 'Make this category available for selection again.'
                        : 'Archiving keeps every record. Active subcategories, assigned guides, current releases and active catalog items must move first; superseded releases keep their own reference and do not block this.'
                    }
                    open={archiveOpen}
                    onOpenChange={(next) => {
                      if (!pending) {
                        setArchiveOpen(next);
                        setActionError('');
                      }
                    }}
                    closeDisabled={pending}
                  >
                    <div className="structured-form">
                      <p>
                        <strong>{categoryPath(selected)}</strong>
                      </p>
                      {!selected.archived && blockersLoading && (
                        <p role="status">Checking what still uses this category…</p>
                      )}
                      {!selected.archived &&
                        blockers &&
                        blockingReasons(blockers, workspace.id).length > 0 && (
                          <div className="structured-blockers">
                            <p>
                              <strong>Move these first.</strong> Nothing is deleted; each of these
                              still points at this category.
                            </p>
                            <ul>
                              {blockingReasons(blockers, workspace.id).map((reason) => (
                                <li key={reason.key}>
                                  <span className="structured-blocker-count">{reason.count}</span>
                                  {reason.label}
                                  {reason.href && <a href={reason.href}>{reason.action}</a>}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      {actionError && <ErrorNotice error={actionError} />}
                      <div className="structured-form-actions">
                        <Button
                          type="button"
                          variant="secondary"
                          onClick={() => setArchiveOpen(false)}
                          disabled={pending}
                        >
                          Cancel
                        </Button>
                        <Button
                          type="button"
                          disabled={
                            pending ||
                            (!selected.archived &&
                              (blockersLoading ||
                                (blockers !== null &&
                                  blockingReasons(blockers, workspace.id).length > 0)))
                          }
                          onClick={() => void archive()}
                        >
                          {pending
                            ? 'Saving…'
                            : selected.archived
                              ? 'Restore category'
                              : 'Archive category'}
                        </Button>
                      </div>
                    </div>
                  </Dialog>
                </div>
              )}
            </>
          ) : (
            <div className="structured-detail-empty">
              <FolderTree size={40} />
              <h2>Pick one to see what is inside it</h2>
              <p>
                {domain === 'guide'
                  ? `Choose a ${words.thing} on the left to rename it, move it, or see what is filed under it.`
                  : 'Choose a category on the left to rename it or move it.'}
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
export function CatalogManagementPage({ workspaceId }: { workspaceId: string }) {
  return (
    <SessionGate workspaceId={workspaceId}>
      {(_, workspace) => <CatalogManagement workspace={workspace!} />}
    </SessionGate>
  );
}
function CatalogManagement({ workspace }: { workspace: StudioWorkspace }) {
  const { items, usage, error, loading, refresh } = useCatalog(workspace.id, { withUsage: true });
  const { categories, error: categoryError } = useCategories(workspace.id);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<CatalogItem['kind'] | 'all'>('all');
  const [selectedId, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<'all' | 'active' | 'inactive'>('active');
  const [notice, setNotice] = useState('');
  const usageById = useMemo(() => new Map(usage.map((entry) => [entry.itemId, entry])), [usage]);
  const selected = items.find((item) => item.id === selectedId);
  // Status counts describe what the other filters match, before the selected
  // status narrows it, so All always equals Active plus Inactive.
  const matching = filterCatalog(items, {
    search,
    kind: kind === 'all' ? undefined : kind,
    includeArchived: true,
  });
  const statusCounts = {
    active: matching.filter((item) => !item.archived).length,
    inactive: matching.filter((item) => item.archived).length,
    all: matching.length,
  };
  const visible = matching.filter((item) =>
    status === 'all' ? true : status === 'active' ? !item.archived : item.archived,
  );
  const owner = workspace.role === 'owner';
  return (
    <main className="studio-container structured-management" id="main" tabIndex={-1}>
      <ManagementHeader workspace={workspace} active="catalog" />
      <div className="structured-management-toolbar">
        <div className="structured-search">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search catalog"
            placeholder="Find names, sizes or models…"
          />
        </div>
        {owner && (
          <CatalogDialog
            workspace={workspace}
            initialKind={kind === 'all' ? 'tool' : kind}
            initialName={search}
            trigger={
              <Button type="button">
                <Plus size={17} />
                New catalog item
              </Button>
            }
            onSaved={(item) => {
              setSelected(item.id);
              setNotice('Catalog item created and ready to reuse.');
            }}
          />
        )}
      </div>
      {notice && (
        <p className="structured-success" role="status">
          {notice}
        </p>
      )}
      <div className="catalog-management-grid">
        <aside className="structured-tree-panel">
          <label>
            What do you need?
            <select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}>
              <option value="all">Tools, materials and parts</option>
              <option value="tool">Tools</option>
              <option value="material">Materials</option>
              <option value="part">Replacement parts</option>
            </select>
          </label>
          <div className="structured-status-tabs" role="group" aria-label="Item status">
            {(['all', 'active', 'inactive'] as const).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={status === option}
                onClick={() => setStatus(option)}
              >
                {option === 'all' ? 'All' : option === 'active' ? 'Active' : 'Inactive'}
                <span className="structured-status-count">{statusCounts[option]}</span>
              </button>
            ))}
          </div>
          {categoryError && <ErrorNotice error={categoryError} />}
          <a className="structured-manage-link" href={`/studio/${workspace.id}/categories`}>
            Manage {words.things}
          </a>
        </aside>
        <section className="catalog-list-panel" aria-label="Catalog items">
          <p className="structured-count" role="status">
            {loading
              ? 'Loading catalog…'
              : `${visible.length} ${visible.length === 1 ? 'item' : 'items'}`}
          </p>
          {error ? (
            <>
              <ErrorNotice error={error} />
              <Button type="button" variant="secondary" onClick={refresh}>
                Try again
              </Button>
            </>
          ) : !loading && !visible.length ? (
            <div className="structured-empty">
              <Package size={36} />
              {/* An empty workspace and an over-narrow filter are different
                  situations, and offering to clear a filter nobody set reads
                  as a failure rather than a beginning. */}
              {items.length === 0 ? (
                <>
                  <h2>Nothing here yet</h2>
                  <p>
                    This is where the tools, materials and parts your guides call for will live,
                    once you add one.
                  </p>
                </>
              ) : (
                <>
                  <h2>Nothing matches those filters</h2>
                  <p>Clear a filter, or search for something else.</p>
                </>
              )}
            </div>
          ) : (
            <ul className="catalog-management-list">
              {visible.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={selectedId === item.id ? 'selected' : ''}
                    onClick={() => setSelected(item.id)}
                  >
                    <span className="catalog-kind-icon">
                      {item.kind === 'tool' ? <Wrench size={20} /> : <Package size={20} />}
                    </span>
                    <span className="catalog-item-copy">
                      <strong>{item.name}</strong>
                      <span>{item.specification || 'General specification'}</span>
                    </span>
                    {describeUsage(usageById.get(item.id))}
                    <span className="structured-kind-label">
                      {item.archived ? 'Inactive' : item.kind}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      {selected && (
        <CatalogDetail
          key={`${selected.id}-${selected.version}`}
          workspace={workspace}
          item={selected}
          onChanged={(message) => setNotice(message)}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}
function CatalogDetail({
  workspace,
  item,
  onChanged,
  onClose,
}: {
  workspace: StudioWorkspace;
  item: CatalogItem;
  onChanged: (message: string) => void;
  onClose: () => void;
}) {
  const detail = useRef<HTMLElement>(null);
  useEffect(() => {
    detail.current?.focus({ preventScroll: true });
    detail.current?.scrollIntoView?.({ block: 'nearest' });
  }, [item.id]);
  const [usage, setUsage] =
    useState<{ id: string; title: string; audience: string; currentRelease: number | null }[]>();
  const [usageError, setUsageError] = useState('');
  const [open, setOpen] = useState(false);
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
  async function archive() {
    setPending(true);
    setError('');
    try {
      await studioFetch(`/api/studio/${workspace.id}/catalog/${item.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          kind: item.kind,
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
      setOpen(false);
      onChanged(
        item.archived
          ? 'Item restored.'
          : 'Item archived. Existing guide requirements remain readable.',
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to change this item.');
    } finally {
      setPending(false);
    }
  }
  return (
    <section
      ref={detail}
      tabIndex={-1}
      className="structured-detail-panel catalog-detail"
      aria-label="Catalog item details"
    >
      <div className="structured-detail-heading">
        <div>
          <h2>{item.name}</h2>
          <p>{item.specification}</p>
        </div>
        <Button type="button" variant="secondary" onClick={onClose}>
          Close details
        </Button>
      </div>
      <p>{item.description || 'No description yet.'}</p>
      <dl className="structured-facts">
        <div>
          <dt>Type</dt>
          <dd>{item.kind}</dd>
        </div>
        <div>
          <dt>Default unit</dt>
          <dd>{item.defaultUnit}</dd>
        </div>
        <div>
          <dt>Visibility</dt>
          <dd>{item.visibility === 'public' ? 'Public' : 'Workspace members'}</dd>
        </div>
        {item.manufacturer && (
          <div>
            <dt>Manufacturer</dt>
            <dd>{item.manufacturer}</dd>
          </div>
        )}
        {item.model && (
          <div>
            <dt>Model</dt>
            <dd>{item.model}</dd>
          </div>
        )}
        {item.partNumber && (
          <div>
            <dt>Part number</dt>
            <dd>{item.partNumber}</dd>
          </div>
        )}
      </dl>
      <div className="structured-usage">
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
      </div>
      {workspace.role === 'owner' && (
        <div className="structured-detail-actions">
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
              onChanged('Item updated. Published requirements keep their previous details.')
            }
          />
          <Dialog
            trigger={
              <Button type="button" variant="secondary">
                {item.archived ? <RotateCcw size={15} /> : <Archive size={15} />}{' '}
                {item.archived ? 'Restore item' : 'Archive item'}
              </Button>
            }
            title={item.archived ? 'Restore catalog item' : 'Archive catalog item'}
            description={
              item.archived
                ? 'Make the item available for new requirements again.'
                : 'Archived items leave new-item selectors. Existing draft and published requirements keep their saved details.'
            }
            open={open}
            onOpenChange={(next) => {
              if (!pending) setOpen(next);
            }}
            closeDisabled={pending}
          >
            <div className="structured-form">
              <p>
                <strong>{item.name}</strong> {item.specification}
              </p>
              {error && <ErrorNotice error={error} />}
              <div className="structured-form-actions">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="button" disabled={pending} onClick={() => void archive()}>
                  {pending ? 'Saving…' : item.archived ? 'Restore item' : 'Archive item'}
                </Button>
              </div>
            </div>
          </Dialog>
        </div>
      )}
    </section>
  );
}
