export default function StoresLoading() {
  return (
    <div className="space-y-3" aria-busy="true">
      <div className="skeleton-row h-8 w-48" />
      <div className="card flex h-64 items-center justify-center p-4">
        <div className="skeleton-row h-3 w-24" />
      </div>
    </div>
  );
}
