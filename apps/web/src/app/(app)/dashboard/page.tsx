import { ActivityTimeline } from "@/components/dashboard/activity-timeline";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { MetricsGrid } from "@/components/dashboard/metrics-grid";
import { QueueStatus } from "@/components/dashboard/queue-status";
import { RecentErrors } from "@/components/dashboard/recent-errors";
import { RecentWorkflows } from "@/components/dashboard/recent-workflows";
import { SystemHealth } from "@/components/dashboard/system-health";
import { RecentExecutions } from "@/components/dashboard/recent-executions";

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Header + Metrics */}
      <div className="space-y-6">
        <DashboardHeader />
        <MetricsGrid />
      </div>

      {/* System health + Queue */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5 lg:items-stretch">
        <div className="lg:col-span-3 lg:flex">
          <div className="lg:flex-1 lg:h-full [&>*]:h-full">
            <SystemHealth />
          </div>
        </div>

        <div className="lg:col-span-2 lg:flex">
          <div className="lg:flex-1 lg:h-full [&>*]:h-full">
            <QueueStatus />
          </div>
        </div>
      </div>

      {/* Recent errors + Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5 lg:items-stretch">
        <div className="lg:col-span-3 lg:flex">
          <div className="lg:flex-1 lg:h-full [&>*]:h-full">
            <RecentErrors />
          </div>
        </div>

        <div className="lg:col-span-2 lg:flex">
          <div className="lg:flex-1 lg:h-full [&>*]:h-full">
            <ActivityTimeline />
          </div>
        </div>
      </div>

      {/* Recent workflows */}
      <RecentWorkflows />

      {/* Recent Executions */}
      <RecentExecutions />
    </div>
  );
}