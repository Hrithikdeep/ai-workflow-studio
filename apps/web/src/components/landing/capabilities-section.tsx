import {
  Code2,
  GitBranch,
  ShieldCheck,
  SquareTerminal,
  Telescope,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { CapabilityCard } from "./capability-card";

const ITEMS: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Code2,
    title: "Type-safe SDK",
    description:
      "Generate clients from workflow schemas. Autocomplete variables and validate inputs at build time.",
  },
  {
    icon: GitBranch,
    title: "Version-controlled workflows",
    description:
      "Export graphs as YAML, diff changes in pull requests and roll back with a commit hash.",
  },
  {
    icon: Telescope,
    title: "Full execution observability",
    description:
      "Trace every node, payload, retry and AI tool call. Jump from a log line to the exact canvas state.",
  },
  {
    icon: ShieldCheck,
    title: "Credential isolation",
    description:
      "OAuth tokens and secrets live in encrypted storage, scoped per workspace and never exposed to the client.",
  },
  {
    icon: Zap,
    title: "Deterministic retries",
    description:
      "Configure per-node retry policies, idempotency keys and exponential backoff without custom code.",
  },
  {
    icon: SquareTerminal,
    title: "Test before shipping",
    description:
      "Run a single node or the whole graph against sample input, then promote to production in one click.",
  },
];

export function CapabilitiesSection() {
  return (
    <section id="capabilities">
      <div className="mx-auto w-full max-w-6xl px-6 py-16 lg:py-20">
        <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
          Engineering capabilities
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          The features that matter when automation becomes production
          infrastructure.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map((item) => (
            <CapabilityCard
              key={item.title}
              icon={item.icon}
              title={item.title}
              description={item.description}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
