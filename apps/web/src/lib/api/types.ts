export type WorkflowStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'

export type Workflow = {
  id: string
  name: string
  description?: string | null
  status?: WorkflowStatus
  createdAt?: string
  updatedAt?: string
  versions?: WorkflowVersion[]
}

export type WorkflowVersion = {
  id: string
  workflowId: string
  version: number
  isPublished: boolean
  createdAt?: string
  nodes?: WorkflowNode[]
  edges?: WorkflowEdge[]
}

export type WorkflowNode = {
  id: string
  type?: string | null
  label?: string
  positionX: number
  positionY: number
  config?: Record<string, unknown>
}

export type WorkflowEdge = {
  id: string
  sourceNodeId: string
  targetNodeId: string
  sourceHandle?: string | null
  targetHandle?: string | null
}

export type WorkflowGraph = {
  nodes: WorkflowNode[]
  edges: WorkflowEdge[]
}

export type ExecutionStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'

export type Execution = {
  id: string
  workflowId: string
  workflowVersionId: string
  status: ExecutionStatus
  triggerType?: string | null
  input?: Record<string, unknown> | null
  output?: Record<string, unknown> | null
  error?: string | null
  startedAt?: string | null
  completedAt?: string | null
  createdAt?: string
  updatedAt?: string
  workflow?: {
    id: string
    name?: string | null
  } | null
  workflowVersion?: {
    id: string
    version?: number
    nodes?: Array<{
      id: string
      type?: string | null
      label?: string | null
      positionX?: number
      positionY?: number
      config?: Record<string, unknown>
    }>
    edges?: Array<{
      id: string
      sourceNodeId: string
      targetNodeId: string
      sourceHandle?: string | null
      targetHandle?: string | null
    }>
  } | null
  steps?: Array<{
    id: string
    nodeId?: string | null
    status?: string | null
    duration?: number | null
    startedAt?: string | null
    completedAt?: string | null
    input?: Record<string, unknown> | null
    output?: Record<string, unknown> | null
    error?: string | null
    node?: {
      id: string
      label?: string | null
      type?: string | null
    } | null
  }>
}
