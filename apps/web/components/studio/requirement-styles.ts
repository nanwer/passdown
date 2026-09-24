/**
 * The pieces the preparation list and the per-step requirements share, so the
 * two editors cannot drift apart. They were one stylesheet's worth of classes
 * reached for from both files.
 */
export const fieldLabel = 'grid min-w-0 gap-1.5 text-[12px] font-medium';
export const fieldControl =
  'w-full min-w-0 rounded-lg border border-control bg-canvas px-3 py-2 text-sm text-ink font-normal';
/**
 * A checkbox beside its words. Studio labels stack their contents at 14px and
 * semibold; this one keeps them in a row, at normal weight.
 */
export const checkboxLabel =
  'requirement-checkbox flex min-h-9 cursor-pointer flex-row items-center gap-2 text-[13px] font-normal';
export const checkbox = 'm-0 size-4 flex-[0_0_16px] p-0';
/** A warning a person needs to act on, with any paragraphs inside kept tight. */
export const feedback =
  'my-4 rounded-[8px] border border-solid border-warning-line bg-warning-surface p-3.5 text-[13px] leading-[1.6] text-warning [&_p]:mt-0 [&_p]:mb-2.5 [&_p]:text-inherit';
export const cardHeader = 'flex items-start justify-between gap-4';
export const cardTitle = 'm-0 text-[15px] leading-6 font-semibold wrap-anywhere';
export const cardDetail = 'mx-0 mt-[5px] mb-0 text-[12px] text-muted';
export const addActions = 'mt-3 flex flex-wrap gap-2.5';
export const quiet = 'text-[12px] leading-[1.6] font-normal text-muted';
