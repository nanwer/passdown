/**
 * How the thing and catalog pickers, their forms and the management details
 * look. Several components share these, so they are named here once.
 *
 * Where the old stylesheet styled an element through its container — a
 * form's labels, a list's items — the rule stays on the container as a
 * variant, so the markup inside does not have to repeat it.
 */

export const back =
  'mb-5 inline-flex cursor-pointer items-center gap-2 border-0 [background:none] p-0 text-[13px] text-muted no-underline';
export const pickerContent = 'structured-picker-content min-w-0';
export const detailIcon = 'mb-5 inline-flex rounded-[12px] bg-sunken p-4';

export const search =
  'relative flex min-w-0 items-center gap-2.5 rounded-[8px] border border-solid border-[var(--gp-component-field-border)] bg-[var(--gp-component-field-background)] px-3 py-0 text-muted focus-within:[outline:2px_solid_var(--gp-semantic-focus-ring)] focus-within:outline-offset-[2px] [&>svg]:shrink-0 [&_input]:h-[43px] [&_input]:w-full [&_input]:min-w-0 [&_input]:[border:0] [&_input]:bg-transparent [&_input]:p-0 [&_input]:text-[13px] [&_input]:text-ink [&_input]:[outline:0]';

// The tree of things in the picker.
export const tree =
  '-mx-1 mt-3.5 mb-0 overflow-x-auto pb-2 [&_ul]:m-0 [&_ul]:list-none [&_ul]:p-0 [&_ul_ul]:ms-2.5 [&_ul_ul]:border-s [&_ul_ul]:border-solid [&_ul_ul]:border-s-line [&_ul_ul]:ps-3.5';
export const treeRow = 'group mx-0 my-[3px] flex min-w-[180px] items-center gap-[1px]';
export const expander =
  'grid min-h-8 w-6 flex-[0_0_24px] cursor-pointer place-items-center rounded-[4px] border-0 bg-transparent text-muted hover:bg-sunken';
export const leafSpacer = 'w-6 flex-[0_0_24px]';
export const node =
  'flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-[6px] border border-solid border-transparent bg-transparent px-2 py-2.5 text-start text-[13px] text-ink hover:border-line hover:bg-sunken [&>span]:min-w-0 [&>span]:flex-1 [&>span]:wrap-anywhere [&>svg]:shrink-0 [&_small]:text-[10px] [&_small]:text-muted';
export const nodeSelected = 'border-line bg-sunken font-[650]';
export const nodePicture = 'size-5.5 flex-none rounded-[5px] object-cover';
export const nodeCount =
  'ml-auto rounded-[999px] border border-solid border-line px-[7px] py-[1px] text-[11px] whitespace-nowrap text-muted tabular-nums';
/** Quiet until its row is hovered or it is focused, and always there on a touch screen. */
export const addChild =
  'inline-flex size-6.5 flex-[0_0_26px] cursor-pointer items-center justify-center rounded-[6px] border border-solid border-transparent [background:none] text-muted opacity-[0] group-hover:border-control group-hover:bg-raised group-hover:opacity-[1] hover:text-ink focus-visible:border-control focus-visible:bg-raised focus-visible:opacity-[1] [@media(hover:none)]:opacity-[1]';

// Search results in the picker, shown instead of the tree while searching.
export const results = 'mx-0 my-3.5 list-none p-0';
export const result =
  'flex w-full cursor-pointer items-center gap-2.5 rounded-[7px] border border-solid border-transparent bg-transparent p-3 text-start text-ink hover:border-line hover:bg-sunken [&>span]:flex-1 [&_small]:mt-[5px] [&_small]:block [&_small]:text-[11px] [&_small]:text-muted [&_small]:wrap-anywhere [&_strong]:block [&_strong]:text-[13px] [&_strong]:wrap-anywhere';
export const resultSelected = 'border-line bg-sunken';
export const empty = 'px-3 py-7 text-[13px] leading-[1.7] text-muted';

// The picker's own control.
export const picker = 'min-w-0';
export const fieldLabel = 'mb-2 block text-[13px] font-semibold';
export const trigger =
  'flex w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-[7px] border border-solid border-[var(--gp-component-field-border)] bg-[var(--gp-component-field-background)] p-3 text-start text-[13px] leading-[1.5] text-ink disabled:cursor-default disabled:opacity-[0.55] [&>span]:flex-1 [&>span]:wrap-anywhere [&>svg]:shrink-0';
export const treeScroll = 'max-h-87.5 overflow-auto [overscroll-behavior:contain]';
export const pickerFooter =
  'mt-4.5 flex flex-wrap items-center gap-3 border-t border-solid border-t-line pt-4.5 [&_small]:text-[11px] [&_small]:text-muted';
export const topLevel =
  'mx-0 mt-3.5 mb-1 inline-flex cursor-pointer border-0 [background:none] p-0 text-[12px] text-ink underline underline-offset-[3px]';
export const warning = 'mt-2 block text-[12px] text-warning';

/**
 * A create or edit form. Its labels stack their words over the control; its
 * controls share one look. The class name stays so a dialog can size itself
 * around a form.
 */
export const form =
  'structured-form flex min-w-0 flex-col gap-4.5 [&_label]:flex [&_label]:min-w-0 [&_label]:flex-col [&_label]:gap-[7px] [&_label]:text-[13px] [&_label]:font-semibold [&_:is(input,textarea,select)]:w-full [&_:is(input,textarea,select)]:min-w-0 [&_:is(input,textarea,select)]:rounded-[7px] [&_:is(input,textarea,select)]:border [&_:is(input,textarea,select)]:border-solid [&_:is(input,textarea,select)]:border-[var(--gp-component-field-border)] [&_:is(input,textarea,select)]:bg-[var(--gp-component-field-background)] [&_:is(input,textarea,select)]:px-3 [&_:is(input,textarea,select)]:py-[11px] [&_:is(input,textarea,select)]:text-[13px] [&_:is(input,textarea,select)]:font-normal [&_:is(input,textarea,select)]:text-ink [&_:is(input,textarea,select)]:[font-family:inherit] [&_:is(input,textarea,select)]:[font-style:inherit] [&_:is(input,select)]:[line-height:inherit] [&_textarea]:resize-y [&_textarea]:leading-[1.6] [&_:is(input,textarea,select):disabled]:opacity-[0.6]';
export const fieldsRow = 'grid grid-cols-[1fr_1fr] gap-4 max-[480px]:grid-cols-[1fr]';
export const optional = 'inline text-[11px] font-normal text-muted';
export const pathPreview =
  'm-0 rounded-[7px] bg-sunken px-3.5 py-3 text-[13px] wrap-anywhere [&>span]:mb-[5px] [&>span]:block [&>span]:text-[10px] [&>span]:tracking-[0.06em] [&>span]:text-muted [&>span]:uppercase';
export const notice = 'text-[12px] leading-[1.6] text-muted';
export const formActions = 'flex justify-end gap-2.5 pt-2 max-[480px]:flex-wrap';
export const extraFields =
  'open:flex open:flex-col open:gap-4 [&_summary]:cursor-pointer [&_summary]:text-[12px]';

// Catalog picker results.
export const catalogResults =
  'catalog-picker-results max-h-90 overflow-auto [overscroll-behavior:contain] [&_li+li]:border-t [&_li+li]:border-solid [&_li+li]:border-t-line [&_ul]:m-0 [&_ul]:list-none [&_ul]:p-0';
export const catalogResult =
  'flex w-full min-w-0 cursor-pointer items-start gap-[13px] rounded-[7px] border border-solid border-transparent bg-transparent px-2.5 py-[17px] text-start text-ink hover:bg-sunken max-[480px]:gap-2';
export const kindIcon =
  'inline-flex flex-[0_0_auto] rounded-[9px] bg-sunken p-2.5 text-muted max-[480px]:p-[7px]';
export const itemCopy =
  'flex min-w-0 flex-1 flex-col gap-[5px] [&_strong]:text-[14px] [&_strong]:leading-[1.4] [&_strong]:wrap-anywhere [&>small]:text-[11px] [&>small]:leading-[1.6] [&>small]:text-muted [&>small]:wrap-anywhere [&>span]:text-[12px] [&>span]:wrap-anywhere';
export const pickerStatus = 'inline-flex items-center gap-1 text-[11px] text-muted';

// Management details.
export const count = 'm-0 pt-1 pr-2.5 pb-4 pl-2.5 text-[11px] tracking-[0.05em] uppercase';
export const usage =
  'mx-0 my-6 [&_a]:underline [&_a]:underline-offset-[3px] [&_h3]:mb-3 [&_h3]:text-[15px] [&_li]:mx-0 [&_li]:my-2.5 [&_li]:flex [&_li]:gap-4 [&_li]:text-[13px] [&_p]:text-[13px] [&_small]:text-muted [&_ul]:list-none [&_ul]:p-0';
/** Kept as a class name: the authoring scenarios look for it. */
export const blockers =
  'structured-blockers rounded-[10px] border border-solid border-warning-line bg-warning-surface px-[15px] py-[13px] text-[13px] text-warning [&_a]:text-inherit [&_a]:underline [&_li]:flex [&_li]:flex-wrap [&_li]:items-center [&_li]:gap-[9px] [&_p]:mx-0 [&_p]:mt-0 [&_p]:mb-[9px] [&_ul]:m-0 [&_ul]:grid [&_ul]:list-none [&_ul]:gap-[7px] [&_ul]:p-0';
export const blockerCount =
  'min-w-[22px] rounded-[999px] bg-raised px-[7px] py-[1px] text-center font-[650] text-ink tabular-nums';
export const thingPicture = 'grid gap-2 [justify-items:start]';
export const thingImage =
  'structured-thing-image block size-24 rounded-[10px] border border-solid border-line bg-sunken object-cover';
export const pictureActions =
  'flex flex-wrap items-center gap-2 text-[13px] [&_progress]:h-2 [&_progress]:w-30';
export const management = 'max-w-[1320px]';
