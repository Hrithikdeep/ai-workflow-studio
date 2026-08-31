"use client"

import {
  Activity,
  CircleCheck,
  Clock3,
  Workflow,
} from "lucide-react";

import { MetricCard } from "./metric-card";
import { useExecutionStats } from "@/hooks/use-executions";
import { useWorkflows } from "@/hooks/use-workflows";

export function MetricsGrid() {
  const {
    data: workflows = [],
    isLoading: workflowsLoading,
    isError: workflowsError,
  } = useWorkflows();

  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
  } = useExecutionStats();

  const workflowCount = workflows.length;

  const totalExecutions = stats?.total ?? 0;
  const succeededExecutions = stats?.succeeded ?? 0;
  const completedExecutions = stats?.completed ?? 0;
  const runningExecutions = stats?.running ?? 0;

  // Success Rate = successful completed executions / completed executions.
  const successRate =
    completedExecutions > 0
      ? `${Math.round((succeededExecutions / completedExecutions) * 100)}%`
      : "—";

  return (
    <section
      aria-label="Workflow metrics"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      <MetricCard
        label="Workflows"
        value={
          workflowsLoading
            ? "Loading..."
            : workflowsError
              ? "—"
              : workflowCount
        }
        description={
          workflowsLoading
            ? "loading"
            : workflowsError
              ? "Unavailable"
              : `${workflowCount} total`
        }
        icon={Workflow}
      />

      <MetricCard
        label="Executions"
        value={
          statsLoading ? "Loading..." : statsError ? "—" : totalExecutions
        }
        description={
          statsLoading
            ? "loading"
            : statsError
              ? "Unavailable"
              : `${totalExecutions} total`
        }
        icon={Activity}
      />

      <MetricCard
        label="Success Rate"
        value={statsLoading ? "Loading..." : statsError ? "—" : successRate}
        description={
          statsLoading
            ? "loading"
            : statsError
              ? "Unavailable"
              : `${succeededExecutions} successful`
        }
        icon={CircleCheck}
      />

      <MetricCard
        label="Running"
        value={
          statsLoading ? "Loading..." : statsError ? "—" : runningExecutions
        }
        description={
          statsLoading
            ? "loading"
            : statsError
              ? "Unavailable"
              : `${runningExecutions} active`
        }
        icon={Clock3}
      />
    </section>
  );
}
