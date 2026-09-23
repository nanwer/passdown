import { cn } from '@guide/ui';

/**
 * How the editor's toolbar, menus and tooltips look, shared by the toolbar,
 * the table menu and the panel menu so they cannot drift apart.
 */
export const toolbarClass =
  'rte-composer-toolbar flex min-h-14 flex-wrap items-center gap-1.5 rounded-[inherit] rounded-b-none border-b border-solid border-b-editor-line bg-editor-toolbar px-3 py-[9px] text-editor-ink max-[600px]:gap-[5px] max-[600px]:p-[7px]';
/** Groups carry a hook class so a group can tell it follows another. */
export const toolbarGroupClass =
  'rte-composer-group flex flex-[0_0_auto] items-center gap-0.5 empty:hidden max-[600px]:gap-[1px] [.rte-composer-group+&]:border-s [.rte-composer-group+&]:border-solid [.rte-composer-group+&]:border-s-editor-line [.rte-composer-group+&]:ps-[7px] max-[600px]:[.rte-composer-group+&]:ps-1';
export const spacerClass = 'min-w-0 flex-1';

const tool = cn(
  'inline-flex h-8.5 min-w-[34px] cursor-pointer items-center justify-center gap-[7px] rounded-[6px] border border-solid border-transparent bg-transparent p-[7px] text-editor-ink select-none',
  '[font:500_13px/1_var(--gp-semantic-font-body)] [transition:background-color_120ms_ease,color_120ms_ease] motion-reduce:[transition:none]',
  '[&_svg]:flex-[0_0_auto] [&_svg]:[stroke-width:1.8]',
  'data-[state=open]:bg-editor-hover aria-pressed:bg-editor-selection aria-pressed:text-action',
  // Hovering wins over pressed, as it did when these were one stylesheet.
  'enabled:hover:bg-editor-hover aria-pressed:enabled:hover:bg-editor-hover',
  'focus-visible:[outline:2px_solid_var(--gp-semantic-focus-ring)] focus-visible:outline-offset-[2px]',
  'disabled:cursor-default disabled:opacity-[0.35]',
  'max-[600px]:h-9 max-[600px]:min-w-[32px] max-[600px]:p-1.5',
);
export const toolClass = tool;
export const textStyleToolClass = cn(
  tool,
  'min-w-[122px] justify-between px-[9px] max-[600px]:min-w-[112px]',
);
export const insertToolClass = cn(tool, 'px-[9px] max-[600px]:px-[7px]');

export const menuClass =
  'z-[80] max-h-[min(520px,var(--radix-dropdown-menu-content-available-height))] w-59 max-w-[calc(100vw_-_24px)] origin-[var(--radix-dropdown-menu-content-transform-origin)] overflow-y-auto rounded-[10px] border border-solid border-editor-line bg-editor-canvas p-1.5 text-editor-ink [box-shadow:0_12px_40px_#10182820,0_2px_6px_#1018280d] [font:500_13px/1.35_var(--gp-semantic-font-body)] [outline:none]';
export const insertMenuClass = cn(menuClass, 'w-65');
export const menuLabelClass =
  'px-2.5 pt-2 pb-1.5 text-[11px] font-semibold tracking-[0.02em] text-editor-muted';
export const menuItemClass =
  'flex min-h-[39px] cursor-pointer items-center gap-[11px] rounded-[6px] px-2.5 py-2 [outline:none] select-none data-[disabled]:cursor-default data-[disabled]:opacity-[0.4] data-[highlighted]:bg-editor-hover [&>svg]:flex-[0_0_auto] [&>svg:not(:last-child)]:text-editor-muted [&>svg]:[stroke-width:1.8]';
export const panelMenuItemClass = cn(menuItemClass, 'py-[7px]');
export const menuCheckClass = 'ms-auto text-action';
export const menuMetaClass = 'ms-auto text-[11px] text-editor-muted';
export const menuSeparatorClass = 'mx-1 my-[5px] h-[1px] bg-editor-line';
export const tooltipClass =
  'z-[100] flex max-w-[calc(100vw_-_20px)] items-center gap-3 rounded-[7px] border border-solid border-editor-line bg-editor-ink px-2.5 py-[7px] text-editor-canvas [box-shadow:0_4px_16px_#10182820] [font:500_12px/1.4_var(--gp-semantic-font-body)] select-none [&_kbd]:text-inherit [&_kbd]:opacity-[0.75] [&_kbd]:[font:500_11px/1.4_var(--gp-semantic-font-body)]';

export const panelIconTone = {
  info: 'bg-info-surface text-info',
  note: 'bg-note-surface text-note',
  success: 'bg-success-surface text-success',
  warning: 'bg-warning-surface text-warning',
  danger: 'bg-error-surface text-error',
  decision: 'bg-accent-surface text-accent-ink',
} as const;
export const panelIconClass = 'grid h-8 flex-[0_0_32px] place-items-center rounded-[7px]';
export const headingPreviewSize: Record<number, string> = {
  1: 'text-[19px]',
  2: 'text-[17px]',
  3: 'text-[15px]',
  4: 'text-[14px]',
};
