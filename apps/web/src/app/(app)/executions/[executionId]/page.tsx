import { ExecutionDetailClient } from "@/components/executions/execution-detail-client";

type ExecutionDetailPageProps = {
  params: Promise<{
    executionId: string;
  }>;
};

export default async function ExecutionDetailPage({
  params,
}: ExecutionDetailPageProps) {
  const { executionId } = await params;

  // Key by executionId so navigating between execution detail pages remounts
  // the client and resets its local UI state (selected step, active tab).
  return (
    <ExecutionDetailClient key={executionId} executionId={executionId} />
  );
}