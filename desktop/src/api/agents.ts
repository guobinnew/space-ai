/**
 * Agents API client
 */
import { api } from './client'

export interface AgentDefinition {
  agentType: string
  whenToUse: string
  tools?: string[]
  disallowedTools?: string[]
  systemPrompt: string
  source: 'built-in' | 'custom'
  model?: string
  availableTools?: string[]
}

export interface CreateAgentInput {
  agentType: string
  whenToUse: string
  tools?: string[]
  disallowedTools?: string[]
  systemPrompt: string
  model?: string
}

export const agentsApi = {
  list() {
    return api.get<{ agents: AgentDefinition[] }>('/api/agents')
  },
  get(agentType: string) {
    return api.get<AgentDefinition>(`/api/agents/${encodeURIComponent(agentType)}`)
  },
  create(input: CreateAgentInput) {
    return api.post<AgentDefinition>('/api/agents', input)
  },
  update(agentType: string, input: Partial<CreateAgentInput>) {
    return api.put<AgentDefinition>(`/api/agents/${encodeURIComponent(agentType)}`, input)
  },
  delete(agentType: string) {
    return api.delete<{ ok: true }>(`/api/agents/${encodeURIComponent(agentType)}`)
  },
}
