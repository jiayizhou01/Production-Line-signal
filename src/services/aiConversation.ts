import type { Anomaly, ChatDataContext, ChatMessage, DailyReport, EvidenceRef } from '../types'

const contexts: ChatDataContext[] = ['seed', 'manual', 'mixed', 'empty', 'unknown']
const isContext = (value: unknown): value is ChatDataContext => typeof value === 'string' && contexts.includes(value as ChatDataContext)

function fromSources(sources: Array<'seed' | 'manual'>, empty: ChatDataContext): ChatDataContext {
  if (!sources.length) return empty
  if (sources.every((source) => source === 'seed')) return 'seed'
  if (sources.every((source) => source === 'manual')) return 'manual'
  return 'mixed'
}

function fromEvidence(refs?: EvidenceRef[]): ChatDataContext {
  return fromSources((refs ?? []).map((ref) => ref.dataSource), 'unknown')
}

function combineContexts(values: ChatDataContext[]): ChatDataContext {
  const known = values.filter((value) => value !== 'unknown')
  if (!known.length) return 'unknown'
  if (known.includes('mixed') || (known.includes('seed') && known.includes('manual'))) return 'mixed'
  if (known.includes('seed')) return 'seed'
  if (known.includes('manual')) return 'manual'
  return 'empty'
}

export function getAiDataContext(reports: DailyReport[], anomalies: Anomaly[]): ChatDataContext {
  return fromSources([...reports, ...anomalies].map((record) => record.dataSource), 'empty')
}

export function createConversationId() {
  const token = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  return `ai-conversation-${token}`
}

export function normalizeAiMessages(messages: ChatMessage[]): ChatMessage[] {
  const ordered = [...messages].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id))
  const normalizedById = new Map<string, ChatMessage>()
  let activeConversationId: string | null = null

  ordered.forEach((message) => {
    const conversationId = message.conversationId ?? (message.role === 'user' ? `legacy-${message.id}` : activeConversationId ?? `legacy-${message.id}`)
    if (message.role === 'user') activeConversationId = conversationId
    const dataContext = isContext(message.dataContext) ? message.dataContext : message.role === 'assistant' ? fromEvidence(message.evidenceRefs) : 'unknown'
    normalizedById.set(message.id, { ...message, conversationId, dataContext })
  })

  const contextsByConversation = new Map<string, ChatDataContext[]>()
  normalizedById.forEach((message) => {
    const values = contextsByConversation.get(message.conversationId!) ?? []
    contextsByConversation.set(message.conversationId!, [...values, message.dataContext!])
  })

  return messages.map((message) => {
    const normalized = normalizedById.get(message.id)!
    return { ...normalized, dataContext: combineContexts(contextsByConversation.get(normalized.conversationId!) ?? ['unknown']) }
  })
}
