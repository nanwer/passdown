'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as Menu from '@radix-ui/react-dropdown-menu';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Columns3, Search } from 'lucide-react';
import { buttonVariants, cn } from '@guide/ui';

/**
 * The pieces every management table is built from.
 *
 * Things and the catalog were a list beside a detail panel, sortable by
 * nothing and showing whatever fitted in a line. They share one table now:
 * every column that has an order sorts, the viewer chooses which columns to
 * see, and the choice survives a reload. The screens own their state — search,
 * status, sort, page, expanded rows — so opening a record and closing it again
 * returns to exactly the table that was there.
 */

export type Column<Row> = {
  key: string;
  header: string;
  /** What the column sorts by. Text compares as people read it; numbers numerically. */
  sortValue: (row: Row) => string | number;
  cell: (row: Row) => ReactNode;
  /** Hidden until the viewer asks for it. */
  hiddenByDefault?: boolean;
  /** The column that names the row, which opens it. It cannot be hidden. */
  primary?: boolean;
  align?: 'start' | 'end';
};

export type Sort = { key: string; direction: 'ascending' | 'descending' } | null;

export function compareBy<Row>(columns: Column<Row>[], sort: Sort) {
  const column = sort && columns.find((candidate) => candidate.key === sort.key);
  if (!column) return null;
  const sign = sort.direction === 'ascending' ? 1 : -1;
  return (a: Row, b: Row) => {
    const [x, y] = [column.sortValue(a), column.sortValue(b)];
    const order =
      typeof x === 'number' && typeof y === 'number'
        ? x - y
        : String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' });
    return order * sign;
  };
}

/** Choosing a column sorts by it; choosing it again reverses it. */
export function nextSort(current: Sort, key: string): Sort {
  if (current?.key !== key) return { key, direction: 'ascending' };
  return { key, direction: current.direction === 'ascending' ? 'descending' : 'ascending' };
}

/**
 * Which columns this viewer has chosen, remembered in this browser.
 *
 * A convenience, so it lives in local storage and every read and write is
 * allowed to fail: a private window simply starts from the defaults.
 */
export function useColumnChoice<Row>(table: string, columns: Column<Row>[]) {
  const defaults = columns.filter((column) => !column.hiddenByDefault).map((column) => column.key);
  const [visible, setVisible] = useState<string[]>(defaults);
  const storageKey = `passdown.table.${table}.columns`;
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null');
      if (Array.isArray(saved)) {
        const known = saved.filter((key) => columns.some((column) => column.key === key));
        const primary = columns.filter((column) => column.primary).map((column) => column.key);
        if (known.length) setVisible([...new Set([...primary, ...known])]);
      }
    } catch {
      // Defaults stand.
    }
    // Columns are declared once per screen, so the storage key identifies them.
  }, [storageKey]);
  const toggle = (key: string) =>
    setVisible((current) => {
      const next = current.includes(key)
        ? current.filter((candidate) => candidate !== key)
        : columns
            .filter((column) => column.key === key || current.includes(column.key))
            .map((column) => column.key);
      // At least one column always remains: the one that names the row.
      if (!next.length) return current;
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Remembered for this visit only.
      }
      return next;
    });
  return { shown: columns.filter((column) => visible.includes(column.key)), visible, toggle };
}

export function ColumnMenu<Row>({
  columns,
  visible,
  onToggle,
}: {
  columns: Column<Row>[];
  visible: string[];
  onToggle: (key: string) => void;
}) {
  return (
    <Menu.Root>
      <Menu.Trigger className={buttonVariants({ variant: 'secondary' })}>
        <Columns3 size={16} aria-hidden="true" />
        Columns
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-52 rounded-[var(--gp-semantic-radius-control)] border border-[var(--gp-semantic-border-subtle)] bg-[var(--gp-semantic-surface-raised)] p-1.5 text-sm text-[var(--gp-semantic-text-primary)] shadow-[var(--gp-component-dialog-shadow)]"
        >
          <Menu.Label className="px-2.5 py-1.5 text-xs text-[var(--gp-semantic-text-secondary)]">
            Show columns
          </Menu.Label>
          {columns.map((column) => (
            <Menu.CheckboxItem
              key={column.key}
              checked={visible.includes(column.key)}
              disabled={column.primary}
              onCheckedChange={() => onToggle(column.key)}
              onSelect={(event) => event.preventDefault()}
              className="flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-2 outline-none select-none data-[disabled]:cursor-default data-[disabled]:text-[var(--gp-semantic-text-secondary)] data-[highlighted]:bg-[var(--gp-semantic-surface-sunken)]"
            >
              <span className="grid size-4 place-items-center rounded border border-[var(--gp-semantic-border-control)]">
                <Menu.ItemIndicator>
                  <Check size={12} strokeWidth={3} />
                </Menu.ItemIndicator>
              </span>
              {column.header}
              {column.primary && <span className="ms-auto text-xs">Always</span>}
            </Menu.CheckboxItem>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

export function SortableHeader<Row>({
  column,
  sort,
  onSort,
}: {
  column: Column<Row>;
  sort: Sort;
  onSort: (key: string) => void;
}) {
  const active = sort?.key === column.key ? sort.direction : undefined;
  const Icon = active === 'ascending' ? ArrowUp : active === 'descending' ? ArrowDown : ArrowUpDown;
  return (
    <th
      scope="col"
      aria-sort={active ?? 'none'}
      className={cn(
        'border-b border-[var(--gp-semantic-border-subtle)] px-3 py-2.5 text-xs font-semibold whitespace-nowrap text-[var(--gp-semantic-text-secondary)]',
        column.align === 'end' ? 'text-end' : 'text-start',
      )}
    >
      <button
        type="button"
        onClick={() => onSort(column.key)}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-sm hover:text-[var(--gp-semantic-text-primary)]',
          active && 'text-[var(--gp-semantic-text-primary)]',
        )}
      >
        {column.header}
        <Icon size={13} aria-hidden="true" className={active ? '' : 'opacity-50'} />
      </button>
    </th>
  );
}

export type Status = 'all' | 'active' | 'inactive';

/**
 * All, Active and Inactive, each counting what the search matches before the
 * status narrows it — so All is always Active plus Inactive.
 */
export function StatusTabs({
  label,
  value,
  counts,
  onChange,
}: {
  label: string;
  value: Status;
  counts: Record<Status, number>;
  onChange: (status: Status) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex gap-1 rounded-[var(--gp-semantic-radius-control)] bg-[var(--gp-semantic-surface-sunken)] p-1"
    >
      {(['all', 'active', 'inactive'] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className="inline-flex min-h-9 items-center gap-2 rounded-[calc(var(--gp-semantic-radius-control)-4px)] px-3 text-[13px] text-[var(--gp-semantic-text-secondary)] aria-pressed:bg-[var(--gp-semantic-surface-raised)] aria-pressed:font-semibold aria-pressed:text-[var(--gp-semantic-text-primary)] aria-pressed:shadow-sm"
        >
          {option === 'all' ? 'All' : option === 'active' ? 'Active' : 'Inactive'}
          <span className="font-mono text-xs tabular-nums">{counts[option]}</span>
        </button>
      ))}
    </div>
  );
}

export function TableSearch({
  id,
  label,
  placeholder,
  value,
  onChange,
}: {
  /** Lets the table return focus here when no row is left to hold it. */
  id?: string;
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative flex min-w-0 flex-1 basis-72 items-center">
      <Search
        size={17}
        aria-hidden="true"
        className="pointer-events-none absolute start-3.5 top-1/2 -translate-y-1/2 text-[var(--gp-semantic-text-secondary)]"
      />
      <input
        id={id}
        type="search"
        maxLength={200}
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[42px] w-full rounded-[var(--gp-semantic-radius-control)] border border-[var(--gp-semantic-border-control)] bg-[var(--gp-semantic-surface-raised)] ps-10 pe-3 text-sm"
      />
    </label>
  );
}

export function Pager({
  page,
  pageSize,
  total,
  noun,
  onPage,
  loading = false,
}: {
  page: number;
  pageSize: number;
  total: number;
  noun: [string, string];
  onPage: (page: number) => void;
  loading?: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages === 1) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <nav
      aria-label={`${noun[1][0]!.toUpperCase()}${noun[1].slice(1)} pages`}
      aria-busy={loading}
      className="flex flex-wrap items-center justify-between gap-3 pt-4 text-[13px] text-[var(--gp-semantic-text-secondary)]"
    >
      <span>
        Showing {first}–{last} of {total} {total === 1 ? noun[0] : noun[1]}
      </span>
      <span className="flex gap-2">
        <button
          type="button"
          className={buttonVariants({ variant: 'secondary', size: 'sm' })}
          disabled={loading || page <= 1}
          onClick={() => onPage(page - 1)}
        >
          Previous
        </button>
        <button
          type="button"
          className={buttonVariants({ variant: 'secondary', size: 'sm' })}
          disabled={loading || page >= pages}
          onClick={() => onPage(page + 1)}
        >
          Next
        </button>
      </span>
    </nav>
  );
}

export const tableClass = 'w-full border-collapse text-sm';
export const cellClass =
  'border-b border-[var(--gp-semantic-border-subtle)] px-3 py-2.5 align-middle';

/**
 * Where keyboard focus goes as a table changes underneath it.
 *
 * Closing a record returns focus to the row that opened it. But a record can
 * leave the table as a result of what was done to it — deactivated under the
 * Active tab, renamed out of the search, moved to another page — and a focused
 * button that disappears drops focus onto the page itself, leaving a keyboard
 * user nowhere. So while focus is still on that row, or has just been lost
 * from it, the table puts it on the row now in the same place, or on the
 * search when nothing is left. A row that was just created takes focus as
 * soon as it appears, once nothing is open over the table — unless the viewer
 * has started doing something else in the meantime. The list can take a while
 * to come back, and a creation finished seconds ago must not pull focus out
 * of a search box somebody is typing in now.
 */
export function useRowFocus(
  rowIds: string[],
  { fallback, paused = false }: { fallback: () => HTMLElement | null; paused?: boolean },
) {
  const openers = useRef(new Map<string, HTMLElement>());
  const last = useRef<{ id: string; index: number } | null>(null);
  const watching = useRef(false);
  const pending = useRef<string | null>(null);
  const [, setPendingVersion] = useState(0);
  const pausedNow = useRef(paused);
  pausedNow.current = paused;

  const neighbour = () => {
    const index = Math.min(last.current?.index ?? 0, rowIds.length - 1);
    const target = (index >= 0 && openers.current.get(rowIds[index]!)) || fallback();
    target?.focus();
    watching.current = false;
  };
  const focusPending = () => {
    const id = pending.current;
    const opener = id && openers.current.get(id);
    if (!id || !opener) return false;
    last.current = { id, index: rowIds.indexOf(id) };
    pending.current = null;
    opener.focus();
    return true;
  };

  useEffect(() => {
    // Anything the viewer moves to deliberately ends the watch.
    const moved = (event: FocusEvent) => {
      const current = last.current && openers.current.get(last.current.id);
      if (event.target !== current) watching.current = false;
    };
    // A key or a press on the table itself is the viewer's next action, and
    // the new row gives way to it. Inside a dialog or sheet it is still part
    // of the creation (typing the name, pressing Add, closing the sheet), and
    // focus moved by a closing dialog is not the viewer acting at all.
    const acted = () => {
      if (!pausedNow.current) pending.current = null;
    };
    document.addEventListener('focusin', moved);
    document.addEventListener('keydown', acted, true);
    document.addEventListener('pointerdown', acted, true);
    return () => {
      document.removeEventListener('focusin', moved);
      document.removeEventListener('keydown', acted, true);
      document.removeEventListener('pointerdown', acted, true);
    };
  }, []);

  useEffect(() => {
    if (paused) return;
    if (pending.current) {
      focusPending();
      return;
    }
    const active = document.activeElement;
    const lost = !active || active === document.body;
    if (watching.current && lost && last.current && !rowIds.includes(last.current.id)) neighbour();
  });

  return {
    /** The ref for the button that opens a row. */
    register: (id: string) => (node: HTMLElement | null) => {
      if (node) openers.current.set(id, node);
      else openers.current.delete(id);
    },
    /** Called when a row is opened, so closing can come back to it. */
    opened(id: string) {
      last.current = { id, index: rowIds.indexOf(id) };
    },
    /** For the sheet's onCloseAutoFocus: the opener, or its neighbour if it has gone. */
    restore(event: Event) {
      event.preventDefault();
      // A row created from inside the record goes first.
      if (pending.current) {
        focusPending();
        return;
      }
      watching.current = true;
      const opener = last.current && openers.current.get(last.current.id);
      if (opener) opener.focus();
      else neighbour();
    },
    /** Focus a row as soon as it exists — one that was just created. */
    focusWhenShown(id: string) {
      pending.current = id;
      setPendingVersion((version) => version + 1);
    },
  };
}

/** Filters combine with search and status; clearing them keeps the chosen sort. */
export function ManagementFilters({
  visibility,
  usage,
  onVisibility,
  onUsage,
  onClear,
  active,
}: {
  visibility: 'all' | 'public' | 'members';
  usage: 'all' | 'used' | 'unused';
  onVisibility: (value: 'all' | 'public' | 'members') => void;
  onUsage: (value: 'all' | 'used' | 'unused') => void;
  onClear: () => void;
  active: boolean;
}) {
  const field = 'rounded-control border border-control bg-panel px-3 py-2 text-sm text-ink';
  return (
    <div className="mb-4 flex flex-wrap items-end gap-3" aria-label="Table filters" role="group">
      <label className="grid gap-1 text-xs text-muted">
        Visibility
        <select
          className={field}
          value={visibility}
          onChange={(e) => onVisibility(e.target.value as typeof visibility)}
        >
          <option value="all">All visibility</option>
          <option value="public">Public</option>
          <option value="members">Members only</option>
        </select>
      </label>
      <label className="grid gap-1 text-xs text-muted">
        Guide usage
        <select
          className={field}
          value={usage}
          onChange={(e) => onUsage(e.target.value as typeof usage)}
        >
          <option value="all">Any usage</option>
          <option value="used">Used in guides</option>
          <option value="unused">Not used in guides</option>
        </select>
      </label>
      {active && (
        <button
          type="button"
          className={buttonVariants({ variant: 'secondary', size: 'sm' })}
          onClick={onClear}
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
