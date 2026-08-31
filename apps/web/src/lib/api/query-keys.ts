export const queryKeys = {
  auth: {
    session: ['auth', 'session'],
  },
  workflows: {
    all: ['workflows'],
    detail: (id: string) => ['workflows', id],
    versions: (id: string) => ['workflows', id, 'versions'],
  },
  workflow: {
    detail: (id: string) => ['workflow', id],
  },
  workflowVersions: {
    all: (workflowId: string) => ['workflowVersions', workflowId],
    detail: (workflowId: string, versionId: string) => ['workflowVersions', workflowId, versionId],
  },
  workflowGraph: {
    detail: (versionId: string) => ['workflowGraph', versionId],
  },
  executions: {
    all: ['executions'],
    detail: (id: string) => ['executions', id],
    stats: ['executions', 'stats'],
    failed: ['executions', 'failed'],
  },
  execution: {
    detail: (id: string) => ['execution', id],
  },
  integrations: {
    all: ['integrations'],
    detail: (id: string) => ['integrations', id],
  },
  webhooks: {
    detail: (workflowId: string) => ['webhooks', workflowId],
  },
  variables: {
    all: ['variables'],
    detail: (id: string) => ['variables', id],
  },
  templates: {
    all: ['templates'],
    detail: (id: string) => ['templates', id],
  },
  settings: {
    all: ['settings'],
  },
  profile: {
    all: ['profile'],
  },
  workspace: {
    settings: ['workspace', 'settings'],
    members: ['workspace', 'members'],
  },
  invitations: {
    all: ['invitations'],
  },
  apiKeys: {
    all: ['api-keys'],
  },
  notificationPreferences: {
    all: ['notification-preferences'],
  },
  sessions: {
    all: ['auth', 'sessions'],
  },
} as const
