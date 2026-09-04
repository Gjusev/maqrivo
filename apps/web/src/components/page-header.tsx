export function PageHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3 md:mb-6">
      <h1 className="text-2xl font-bold tracking-tight text-zinc-900">{title}</h1>
      {action}
    </div>
  );
}
