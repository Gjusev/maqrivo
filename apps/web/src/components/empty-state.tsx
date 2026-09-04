import type { Icon } from "@phosphor-icons/react";

export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
}: {
  icon: Icon;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
      <div className="flex size-12 items-center justify-center rounded-full bg-zinc-100 text-zinc-400">
        <Icon size={24} aria-hidden />
      </div>
      <div>
        <p className="font-medium text-zinc-900">{title}</p>
        {body ? <p className="mt-1 text-sm text-zinc-500">{body}</p> : null}
      </div>
      {action}
    </div>
  );
}
