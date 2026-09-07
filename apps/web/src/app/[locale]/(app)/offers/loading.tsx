export default function OffersLoading() {
  return (
    <div className="space-y-3" aria-busy="true">
      <div className="skeleton-row h-8 w-48" />
      {[0, 1, 2].map((i) => (
        <div key={i} className="card p-4">
          <div className="skeleton-row h-4 w-3/4" />
          <div className="skeleton-row mt-1.5 h-3 w-1/2" />
        </div>
      ))}
    </div>
  );
}
