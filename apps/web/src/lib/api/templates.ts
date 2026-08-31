import api from './client'

export type Template = {
  id: string
  workflowId: string
  name: string
  description: string
  category: string
  featured: boolean
  nodeCount: number
  usageCount: number
  createdAt: string
  updatedAt: string
}

export type TemplateDetail = Template & {
  nodePreview: Array<{ label: string; type: string }>
  capabilities: string[]
}

export type UseTemplateResult = {
  workflowId: string
  versionId: string
}

export function getTemplates() {
  return api.get<Template[]>('/templates')
}

export function getTemplate(id: string) {
  return api.get<TemplateDetail>(`/templates/${encodeURIComponent(id)}`)
}

export function useTemplateById(id: string) {
  return api.post<UseTemplateResult>(`/templates/${encodeURIComponent(id)}/use`)
}
