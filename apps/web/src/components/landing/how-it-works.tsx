import {
  Bot,
  CheckSquare,
  Cpu,
  FilePlus2,
  Layers,
  Puzzle,
  ScrollText,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";

const STEPS: { label: string; icon: LucideIcon }[] = [
  { label: "Create Workflow", icon: FilePlus2 },
  { label: "Validate", icon: CheckSquare },
  { label: "Queue", icon: Layers },
  { label: "Worker", icon: Cpu },
  { label: "AI", icon: Bot },
  { label: "Integrations", icon: Puzzle },
  { label: "Logs", icon: ScrollText },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="border-b border-slate-200">
      <div className="mx-auto w-full max-w-6xl px-6 py-16 lg:py-20">
        <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
          How AI Workflow Studio works
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          From a visual graph to a durable, observable execution — every step is
          handled by the platform.
        </p>

        <div className="mt-10 -mx-6 overflow-x-auto px-6">
          <ol className="flex min-w-max items-center gap-2">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.label} className="flex items-center gap-2">
                  <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 shadow-sm">
                    <Icon className="h-4 w-4 text-blue-600" />
                    <span className="whitespace-nowrap text-sm font-medium text-slate-700">
                      {step.label}
                    </span>
                  </div>
                  {index < STEPS.length - 1 && (
                    <ArrowRight
                      className="h-4 w-4 shrink-0 text-slate-300"
                      aria-hidden="true"
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
