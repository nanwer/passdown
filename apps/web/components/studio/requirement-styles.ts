/**
 * The pieces the preparation list and the per-step requirements share, so the
 * two editors cannot drift apart. They were one stylesheet's worth of classes
 * reached for from both files.
 */
export const fieldLabel = 'grid gap-[7px] text-[12px] font-[550]';
export const fieldControl =
  'w-full min-w-0 rounded-[6px] border border-solid border-line bg-canvas px-2.5 py-[9px] text-ink [font:inherit]';
/**
 * A checkbox beside its words. Studio labels stack their contents at 14px and
 * semibold; this one keeps them in a row, at normal weight.
 */
export const checkboxLabel =
  'requirement-checkbox my-3 flex flex-row items-center gap-2 font-normal';
export const checkbox = 'm-0 size-4 flex-[0_0_16px] p-0';
/** A warning a person needs to act on, with any paragraphs inside kept tight. */
export const feedback =
  'my-4 rounded-[8px] border border-solid border-warning-line bg-warning-surface p-3.5 text-[13px] leading-[1.6] text-warning [&_p]:mt-0 [&_p]:mb-2.5 [&_p]:text-inherit';
export const cardHeader = 'flex items-start justify-between gap-4';
export const cardTitle = 'm-0 text-[15px] wrap-anywhere';
export const cardDetail = 'mx-0 mt-[5px] mb-0 text-[12px] text-muted';
export const addActions = 'mt-3 flex flex-wrap gap-2.5';
export const quiet = 'text-[12px] leading-[1.6] font-normal text-muted';
