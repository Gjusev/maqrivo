export default function WeekLoading() {
  return (
    <div className="space-y-3" aria-busy="true">
      <div className="skeleton-row h-8 w-48" />
      {/* Matches WeekGrid: a stack of day cards, each with a header + slot rows. */}
      <div className="space-y-2">
        {Array.from({ length: 7 }, (_, day) => (
          <div key={day} className="card p-3">
            <div className="skeleton-row h-3 w-24" />
            <div className="mt-2 space-y-2">
              {[0, 1, 2].map((slot) => (
                <div key={slot} className="skeleton-row h-4 w-2/3" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
