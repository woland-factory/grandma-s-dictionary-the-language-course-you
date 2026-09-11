// Holds the layout steady while data loads. Never a white screen.
export function LoadingSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="stack" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton skeleton-item" />
      ))}
    </div>
  );
}
