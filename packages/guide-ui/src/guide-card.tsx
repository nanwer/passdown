import { ArrowUpRight, Clock3 } from 'lucide-react';
import { GuideArtwork, type ArtworkKind } from './artwork';
export type GuideCardProps = {
  title: string;
  summary: string;
  category: string;
  minutes: number;
  difficulty: string;
  steps: number;
  artwork: ArtworkKind;
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
  href,
}: GuideCardProps) {
  return (
    <article className="guide-card">
      <a href={href} className="guide-card-link">
        <div className="guide-card-image">
          <GuideArtwork kind={artwork} />
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
