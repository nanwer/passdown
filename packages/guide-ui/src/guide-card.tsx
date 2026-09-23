import { ArrowUpRight, BookOpenText, Clock3 } from 'lucide-react';
import { GuideArtwork, type ArtworkKind } from './artwork';

/** The coloured dot beside a difficulty: amber for moderate, green otherwise. */
export function difficultyDot(difficulty: string) {
  return `inline-block size-1.5 rounded-[50%] ${difficulty === 'moderate' ? 'bg-warning' : 'bg-success'}`;
}
export type GuideCardProps = {
  title: string;
  summary: string;
  category: string;
  minutes: number;
  difficulty: string;
  steps: number;
  /** A drawing, for the sample guides that ship one instead of pictures. */
  artwork?: ArtworkKind;
  /**
   * The guide's own picture, where it has one.
   *
   * A guide with neither shows a plain placeholder. It used to draw a
   * workbench, from a column nothing ever set, so a library of twenty guides
   * without pictures was twenty identical drawings of the same bench.
   */
  cover?: { src: string; alt: string };
  href: string;
};
export function GuideCard({
  title,
  summary,
  category,
  minutes,
  difficulty,
  steps,
  artwork,
  cover,
  href,
}: GuideCardProps) {
  return (
    <article className="guide-card min-w-0 rounded-panel border border-solid border-line bg-[var(--gp-component-card-background)] [transition:transform_var(--gp-semantic-duration-panel),border-color_var(--gp-semantic-duration-panel)] hover:[transform:translateY(-3px)] hover:border-control">
      <a href={href} className="block h-full rounded-[inherit]">
        <div className="relative overflow-hidden [border-start-end-radius:inherit] [border-start-start-radius:inherit] [&_.artwork]:aspect-[5/3.1]">
          {cover ? (
            <img
              className="guide-card-cover block aspect-video w-full bg-sunken object-cover"
              src={cover.src}
              alt={cover.alt}
              loading="lazy"
            />
          ) : artwork ? (
            <GuideArtwork kind={artwork} />
          ) : (
            <div
              className="guide-card-placeholder grid aspect-[5/3.1] place-items-center bg-sunken text-muted"
              aria-hidden="true"
            >
              <BookOpenText size={30} strokeWidth={1.5} />
            </div>
          )}
          <span
            className="absolute end-3.5 top-3.5 grid size-[29px] place-items-center rounded-[50%] bg-panel"
            aria-hidden="true"
          >
            <ArrowUpRight size={19} />
          </span>
        </div>
        <div className="px-5.5 pt-5.5 pb-4.5 max-[1050px]:p-[17px] max-[470px]:p-[23px]">
          <div className="flex items-center justify-between font-mono text-[9px] text-muted max-[760px]:text-[8px] max-[470px]:text-[10px] [&_span:first-child]:tracking-[0.8px] [&_span:first-child]:uppercase">
            <span>{category}</span>
            <span>{new Intl.NumberFormat('en').format(steps)} steps</span>
          </div>
          <h3 className="mt-3 mb-2 text-[16px] leading-[1.45] font-semibold tracking-[-0.4px] max-[1050px]:text-[15px] max-[470px]:text-[18px]">
            {title}
          </h3>
          <p className="min-h-[43px] text-[12px] leading-[1.8] text-muted max-[760px]:text-[11px] max-[470px]:min-h-0 max-[470px]:text-[13px]">
            {summary}
          </p>
          <div className="mt-5 flex items-center gap-[17px] border-t border-solid border-t-line pt-3.5 text-[10px] text-muted max-[760px]:gap-3 max-[760px]:text-[9px] max-[470px]:text-[11px] [&_span]:flex [&_span]:items-center [&_span]:gap-1.5">
            <span>
              <Clock3 size={14} />
              {new Intl.NumberFormat('en', {
                style: 'unit',
                unit: 'minute',
                unitDisplay: 'short',
              }).format(minutes)}
            </span>
            <span>
              <i className={difficultyDot(difficulty)} />
              {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
            </span>
          </div>
        </div>
      </a>
    </article>
  );
}
