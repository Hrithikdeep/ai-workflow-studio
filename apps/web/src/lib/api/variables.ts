import api from './client'

export type Variable = {
  id: string
  name: string
  value?: string
  type: 'String' | 'Number' | 'Boolean' | 'Secret'
  environment: string
  createdAt: string
  updatedAt: string
}

export type VariablesQuery = {
  search?: string
  environment?: string
  type?: string
}

export function getVariables(params?: VariablesQuery) {
  return api.get<Variable[]>('/variables', { params })
}

export function getVariable(id: string) {
  return api.get<Variable>(`/variables/${id}`)
}

export function createVariable(payload: Partial<Variable>) {
  return api.post<Variable>('/variables', payload)
}

export function updateVariable(id: string, payload: Partial<Variable>) {
  return api.patch<Variable>(`/variables/${id}`, payload)
}

export function deleteVariable(id: string) {
  return api.delete<void>(`/variables/${id}`)
}
