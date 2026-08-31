import api from './client'

export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer'

export type WorkspaceSettings = {
  id: string
  name: string
  slug: string
  description: string
  defaultEnvironment: string
  defaultTimezone: string
  defaultVisibility: string
  role: WorkspaceRole
}

export type UpdateWorkspaceInput = {
  name?: string
  description?: string
  defaultEnvironment?: string
  defaultTimezone?: string
  defaultVisibility?: string
}

export type WorkspaceMember = {
  userId: string
  name: string
  email: string
  role: WorkspaceRole
  status: 'Active'
  joinedAt: string
  isSelf: boolean
}

export function getWorkspaceSettings() {
  return api.get<WorkspaceSettings>('/workspace')
}

export function updateWorkspaceSettings(input: UpdateWorkspaceInput) {
  return api.patch<WorkspaceSettings>('/workspace', input)
}

export function getWorkspaceMembers() {
  return api.get<WorkspaceMember[]>('/workspace/members')
}

export function updateMemberRole(userId: string, role: WorkspaceRole) {
  return api.patch<WorkspaceMember[]>(
    `/workspace/members/${encodeURIComponent(userId)}`,
    { role },
  )
}

export function removeMember(userId: string) {
  return api.delete<WorkspaceMember[]>(
    `/workspace/members/${encodeURIComponent(userId)}`,
  )
}
