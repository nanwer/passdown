export default function LoadingPreview() {
  return (
    <div className="loading-state" aria-busy="true" aria-label="Loading guides">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-copy" />
      <div className="guide-grid">
        {[1, 2, 3].map((key) => (
          <div className="skeleton skeleton-card" key={key} />
        ))}
      </div>
      <span className="sr-only">Loading guides…</span>
    </div>
  );
}
