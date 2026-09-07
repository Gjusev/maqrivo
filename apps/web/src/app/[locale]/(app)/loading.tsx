export default function AppLoading() {
  return (
    <div className="space-y-3" aria-busy="true">
      <div className="skeleton-row h-8 w-48" />
      <div className="card p-4">
        <div className="skeleton-row h-4 w-3/4" />
        <div className="skeleton-row mt-2 h-3 w-1/2" />
      </div>
      <div className="card p-4">
        <div className="skeleton-row h-4 w-2/3" />
        <div className="skeleton-row mt-2 h-3 w-1/3" />
      </div>
    </div>
  );
}
