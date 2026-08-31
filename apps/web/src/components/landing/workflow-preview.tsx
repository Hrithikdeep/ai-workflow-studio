import { cn } from "@/lib/utils";

type Status = "SUCCESS" | "SKIPPED" | "RUNNING";

const STATUS_STYLES: Record<Status, { pill: string; dot: string }> = {
  SUCCESS: {
    pill: "border-emerald-200 bg-emerald-50 text-emerald-600",
    dot: "bg-emerald-500",
  },
  SKIPPED: {
    pill: "border-slate-200 bg-slate-100 text-slate-500",
    dot: "bg-slate-400",
  },
  RUNNING: {
    pill: "border-blue-200 bg-blue-50 text-blue-600",
    dot: "bg-blue-500",
  },
};

type NodeSpec = {
  name: string;
  status: Status;
  dotColor: string;
  /** Centre position as a percentage of the canvas. */
  x: number;
  y: number;
};

const NODES: NodeSpec[] = [
  { name: "Webhook", status: "SUCCESS", dotColor: "bg-amber-500", x: 17, y: 45 },
  { name: "AI Agent", status: "SUCCESS", dotColor: "bg-violet-500", x: 50, y: 22 },
  { name: "Postgres", status: "SKIPPED", dotColor: "bg-teal-500", x: 50, y: 68 },
  { name: "Slack", status: "RUNNING", dotColor: "bg-emerald-500", x: 83, y: 46 },
];

function PreviewNode({ node }: { node: NodeSpec }) {
  const s = STATUS_STYLES[node.status];
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${node.x}%`, top: `${node.y}%` }}
    >
      <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 rounded-full", node.dotColor)} />
          <span className="text-[11px] font-semibold text-slate-800 sm:text-xs">
            {node.name}
          </span>
        </div>
        <span
          className={cn(
            "mt-1.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] sm:text-[9px]",
            s.pill,
          )}
        >
          <span className={cn("h-1 w-1 rounded-full", s.dot)} />
          {node.status}
        </span>
      </div>
    </div>
  );
}

/**
 * Static visual mock of a workflow run — landing-page decoration only.
 * Not connected to the editor or any execution data.
 */
export function WorkflowPreview() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-2 shadow-sm">
      <div
        className="relative aspect-[16/11] w-full overflow-hidden rounded-xl bg-white"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgb(148 163 184 / 0.25) 1px, transparent 1px)",
          backgroundSize: "16px 16px",
        }}
        role="img"
        aria-label="Example workflow: a Webhook node branches to an AI Agent and a Postgres node; the AI Agent connects to a Slack node. Webhook and AI Agent succeeded, Postgres was skipped, Slack is running."
      >
        <svg
          className="absolute inset-0 h-full w-full"
          viewBox="0 0 320 220"
          fill="none"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {/* Webhook -> AI Agent */}
          <path
            d="M70 99 C 110 99, 120 48, 158 48"
            stroke="rgb(148 163 184)"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
          {/* Webhook -> Postgres */}
          <path
            d="M70 99 C 110 99, 120 150, 158 150"
            stroke="rgb(148 163 184)"
            strokeWidth="1.5"
            vectorEffect="non-scaling-stroke"
          />
          {/* AI Agent -> Slack (active) */}
          <path
            d="M214 48 C 244 48, 246 101, 268 101"
            stroke="rgb(37 99 235)"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {NODES.map((node) => (
          <PreviewNode key={node.name} node={node} />
        ))}
      </div>
    </div>
  );
}
