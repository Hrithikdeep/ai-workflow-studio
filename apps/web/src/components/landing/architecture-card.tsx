import type { LucideIcon } from "lucide-react";

export type ArchitectureCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export function ArchitectureCard({
  icon: Icon,
  title,
  description,
}: ArchitectureCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-blue-50 text-blue-600">
        <Icon className="h-4 w-4" />
      </span>
      <h3 className="mt-4 text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
        {description}
      </p>
    </div>
  );
}
