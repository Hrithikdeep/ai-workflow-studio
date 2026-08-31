import type { LucideIcon } from "lucide-react";

export type CapabilityCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
};

export function CapabilityCard({
  icon: Icon,
  title,
  description,
}: CapabilityCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <Icon className="h-5 w-5 text-blue-600" />
      <h3 className="mt-3 text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-500">
        {description}
      </p>
    </div>
  );
}
