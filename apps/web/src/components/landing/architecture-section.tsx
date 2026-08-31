import {
  Cog,
  Cpu,
  Database,
  HardDrive,
  Layers3,
  Server,
  type LucideIcon,
} from "lucide-react";

import { ArchitectureCard } from "./architecture-card";

const ITEMS: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Server,
    title: "API",
    description:
      "REST and webhook ingress with typed request validation and per-workflow routing.",
  },
  {
    icon: Layers3,
    title: "BullMQ",
    description:
      "Durable job queues with retries, backoff, priorities and dead-letter handling.",
  },
  {
    icon: Database,
    title: "Redis",
    description:
      "State cache, rate-limit counters and distributed locks for concurrent workers.",
  },
  {
    icon: Cpu,
    title: "Worker",
    description:
      "Horizontal execution pods that pull jobs, run the graph and stream events.",
  },
  {
    icon: Cog,
    title: "Execution Engine",
    description:
      "Deterministic DAG runner with branch evaluation, error paths and replay.",
  },
  {
    icon: HardDrive,
    title: "PostgreSQL",
    description:
      "Persistent workflow definitions, execution records and audit logs.",
  },
];

export function ArchitectureSection() {
  return (
    <section id="architecture" className="border-b border-slate-200">
      <div className="mx-auto w-full max-w-6xl px-6 py-16 lg:py-20">
        <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
          Execution architecture
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-slate-500">
          Built on a small set of proven primitives that scale horizontally and
          fail gracefully.
        </p>

        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ITEMS.map((item) => (
            <ArchitectureCard
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
