import { ArrowUpRight, BookOpenText, Clock3 } from 'lucide-react';
import { GuideArtwork, type ArtworkKind } from './artwork';
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
    <article className="guide-card">
      <a href={href} className="guide-card-link">
        <div className="guide-card-image">
          {cover ? (
            <img className="guide-card-cover" src={cover.src} alt={cover.alt} loading="lazy" />
          ) : artwork ? (
            <GuideArtwork kind={artwork} />
          ) : (
            <div className="guide-card-placeholder" aria-hidden="true">
              <BookOpenText size={30} strokeWidth={1.5} />
            </div>
          )}
          <span className="card-open" aria-hidden="true">
            <ArrowUpRight size={19} />
          </span>
        </div>
        <div className="guide-card-body">
          <div className="card-kicker">
            <span>{category}</span>
            <span>{new Intl.NumberFormat('en').format(steps)} steps</span>
          </div>
          <h3>{title}</h3>
          <p>{summary}</p>
          <div className="card-meta">
            <span>
              <Clock3 size={14} />
              {new Intl.NumberFormat('en', {
                style: 'unit',
                unit: 'minute',
                unitDisplay: 'short',
              }).format(minutes)}
            </span>
            <span>
              <i className={`difficulty-dot difficulty-${difficulty}`} />
              {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
            </span>
          </div>
        </div>
      </a>
    </article>
  );
}
