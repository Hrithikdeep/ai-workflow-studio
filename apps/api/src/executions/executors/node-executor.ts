import { ExecutionStepStatus } from '@prisma/client';

/**
 * Runtime context handed to a node executor. `workspaceId` is resolved
 * from the authenticated request that started the execution — it is never
 * taken from workflow/node data or the client.
 */
export interface NodeExecutionContext {
  workspaceId?: string;
  workflow: { id: string; versionId: string; variables?: Record<string, unknown> };
  execution: { id: string; triggerType: string };
  input: Record<string, unknown>;
  variables: Record<string, unknown>;
  previous: Record<string, unknown>;
}

/** Same shape the existing `evaluateNodeExecution` returns. */
export interface NodeExecutionResult {
  status: ExecutionStepStatus;
  output: Record<string, unknown>;
  error: string | null;
  branch?: 'true' | 'false' | null;
}

export interface ExecutorNode {
  id: string;
  label: string;
  type?: string | null;
}
