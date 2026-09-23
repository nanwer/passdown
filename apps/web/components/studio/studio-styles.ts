import { cn } from '@guide/ui';

/**
 * The studio's shared pieces: the page frame, headings, cards, forms and
 * notices every studio screen is built from.
 *
 * Studio-wide defaults for bare elements — a label stacks its words above its
 * control, a paragraph is muted — stay in the defaults stylesheet, because
 * they apply to markup no component names.
 */
/** The root of every studio page. The class name scopes those element defaults. */
export const studioRoot = 'studio min-h-[100vh] bg-canvas text-ink';
export const container =
  'mx-auto my-auto min-h-[72vh] max-w-[1200px] px-8 py-16 max-[700px]:px-5 max-[700px]:py-9';
export const narrowContainer = cn(container, 'max-w-[850px]');
export const pageHeading = 'mb-9 max-[700px]:mb-6';
export const eyebrow = 'block text-[11px] font-bold tracking-[1.6px] text-muted uppercase';
export const card = 'rounded-[12px] border border-solid border-line bg-panel p-8 max-[700px]:p-6';
export const textLink = 'inline-flex items-center gap-2.5 font-[650] text-action';
export const form = 'grid gap-6';
export const hint = 'text-[13px] font-normal text-muted';
export const actions = 'flex flex-wrap items-center gap-3';
export const notice =
  'mx-0 my-5 rounded-[6px] border border-solid border-info-line bg-info-surface px-5 py-4 text-info';
export const errorNotice = cn(notice, 'border-error-line bg-error-surface text-error');
export const badge =
  'rounded-[20px] border border-solid border-line bg-panel px-2.5 py-1 text-[12px] whitespace-nowrap forced-colors:border-[CanvasText]';
export const inline = 'flex flex-wrap items-center gap-3 text-[13px]';
export const success = 'm-0 text-[13px] text-success';
export const footer = 'border-t border-solid border-t-line px-[4%] py-7 text-[12px] text-muted';
/**
 * A picture picker whose own file input is hidden, leaving the label as the
 * button. The studio frames it as a dashed box; the thing sheet shows it as
 * plain text beside the picture.
 */
export const pictureAddParts =
  'studio-picture-add [&_input]:absolute [&_input]:m-[-1px] [&_input]:size-[1px] [&_input]:overflow-hidden [&_input]:[border:0] [&_input]:p-0 [&_input]:whitespace-nowrap [&_input]:[clip-path:inset(50%)] [&_small]:text-[11px] [&_span]:grid [&_span]:gap-[1px] [&_span]:text-start [&_strong]:text-[13px] [&_strong]:font-semibold [&_strong]:text-ink';
