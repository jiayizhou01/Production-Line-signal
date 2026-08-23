import { getAiDataContext, normalizeAiMessages } from '../src/services/aiConversation.ts'

const assert = (condition, message) => { if (!condition) throw new Error(message) }
const seed = { dataSource: 'seed' }
const manual = { dataSource: 'manual' }

assert(getAiDataContext([seed], []) === 'seed', 'seed-only data must create a seed conversation')
assert(getAiDataContext([manual], []) === 'manual', 'manual-only data must create a manual conversation')
assert(getAiDataContext([seed], [manual]) === 'mixed', 'mixed data must create a mixed conversation')
assert(getAiDataContext([], []) === 'empty', 'empty data must create an empty conversation')

const legacy = normalizeAiMessages([
  { id: 'question', role: 'user', content: '问题', evidenceRefs: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '', createdBy: '', updatedBy: '', dataSource: 'manual', version: 1 },
  { id: 'answer', role: 'assistant', content: '回答', evidenceRefs: [{ id: 'ref', sourceType: 'anomaly', sourceId: 'demo', title: '演示异常', dataSource: 'seed', updatedAt: '', link: '' }], createdAt: '2026-01-01T00:00:01.000Z', updatedAt: '', createdBy: '', updatedBy: '', dataSource: 'manual', version: 1 }
])

assert(legacy.every((message) => message.conversationId === 'legacy-question' && message.dataContext === 'seed'), 'legacy question and answer must migrate together from evidence data source')
console.log('AI conversation context check passed.')
