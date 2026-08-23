import { useEffect, useMemo, useRef, useState } from 'react'
import { Bot, Database, ExternalLink, Lightbulb, Send, Trash2, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { generateAiReply, getEvidenceState } from '../services/aiEvidence'
import { createConversationId, getAiDataContext } from '../services/aiConversation'
import { appStore, useAppData } from '../store/appStore'
import type { ChatMessage, EvidenceRef } from '../types'

const QUICK_QUESTIONS = [
  '昨天哪条产线 OEE 最低？',
  'Line-A 最近 7 天 UPPH 为什么下降？',
  '哪个工位停线时间最长？',
  '最近重复发生最多的异常是什么？',
  '人力投入高于理论工时但 UPPH 仍然偏低的是哪些班次？'
]

const welcomeMessage: ChatMessage = {
  id: 'ai-welcome',
  role: 'assistant',
  content: '你好，我是 AI 制造助手。我会根据当前已录入的生产日报和异常记录进行分析，并在每个判断下方列出可点击的数据依据。',
  evidenceRefs: [],
  createdAt: '',
  updatedAt: '',
  createdBy: '系统',
  updatedBy: '系统',
  dataSource: 'seed',
  version: 1
}

const sourceLabels: Record<EvidenceRef['sourceType'], string> = {
  productionReport: '生产日报',
  anomaly: '异常记录',
  action: '责任行动',
  metric: '指标'
}

function EvidenceCards({ refs }: { refs: EvidenceRef[] }) {
  const navigate = useNavigate()
  const data = useAppData()
  if (!refs.length) return null

  return (
    <div className="mt-3 border-t border-[#d5d5d5] pt-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-[#1e1e1e]"><Database size={13} className="text-[#e1a300]" />数据依据</p>
      <div className="flex flex-wrap gap-2">
        {refs.map((ref) => {
          const state = getEvidenceState(ref, { reports: data.productionReports, anomalies: data.anomalies, settings: data.settings })
          const available = state !== 'deleted'
          return (
            <button
              key={ref.id}
              type="button"
              disabled={!available}
              onClick={() => navigate(ref.link)}
              title={available ? state === 'updated' ? '来源数据已更新，点击查看最新数据' : '查看来源数据' : '来源记录已删除'}
              className="max-w-full rounded-lg border border-[#d5d5d5] bg-white px-2.5 py-2 text-left text-xs transition-colors hover:border-[#e1a300] hover:bg-[#fff8df] disabled:cursor-not-allowed disabled:border-[#d5d5d5] disabled:bg-[#f5f4f0] disabled:text-[#787777]"
            >
              <span className="flex items-center gap-1 font-semibold text-[#1e1e1e] disabled:text-[#787777]">{available ? ref.title : '来源记录已删除'}{available && <ExternalLink size={12} className="shrink-0 text-[#e1a300]" />}</span>
              {available && <span className="mt-1 block text-[#787777]">{sourceLabels[ref.sourceType]} · {state === 'updated' ? '来源已更新' : `更新于 ${ref.updatedAt.slice(0, 16).replace('T', ' ')}`}{ref.formulaVersion ? ` · 公式 ${ref.formulaVersion}` : ''}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function AIAssistant() {
  const { productionReports, anomalies, aiMessages, settings, loading } = useAppData()
  const [input, setInput] = useState('')
  const [isResponding, setIsResponding] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showClearDialog, setShowClearDialog] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [clearError, setClearError] = useState<string | null>(null)
  const [clearNotice, setClearNotice] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const confirmClearRef = useRef<HTMLButtonElement>(null)
  const messages = aiMessages.length ? aiMessages : [welcomeMessage]
  const data = useMemo(() => ({ reports: productionReports, anomalies, settings }), [productionReports, anomalies, settings])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isResponding])

  useEffect(() => {
    if (!showClearDialog) return
    confirmClearRef.current?.focus()
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape' && !isClearing) setShowClearDialog(false) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showClearDialog, isClearing])

  const submitQuestion = async (question: string) => {
    const content = question.trim()
    if (!content || isResponding || loading) return
    setError(null)
    setClearNotice(null)
    setInput('')
    const conversationId = createConversationId()
    const dataContext = getAiDataContext(productionReports, anomalies)
    try {
      await appStore.createAiMessage({ id: `ai-user-${Date.now()}`, role: 'user', content, conversationId, dataContext, evidenceRefs: [] })
      setIsResponding(true)
      window.setTimeout(async () => {
        try {
          const reply = generateAiReply(content, data)
          await appStore.createAiMessage({
            id: `ai-answer-${Date.now()}`,
            role: 'assistant',
            content: reply.content,
            conversationId,
            dataContext,
            evidenceRefs: reply.evidenceRefs,
            isSuggestion: reply.isSuggestion,
            defaultRange: reply.defaultRange
          })
        } catch (replyError) {
          setError(replyError instanceof Error ? replyError.message : 'AI 回答保存失败，请重试。')
        } finally {
          setIsResponding(false)
        }
      }, 300)
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : '问题保存失败，请重试。')
    }
  }

  const clearMessages = async () => {
    setClearError(null)
    setIsClearing(true)
    try {
      await appStore.clearAiMessages()
      setShowClearDialog(false)
      setClearNotice('已清空本浏览器中的全部 AI 对话记录。')
    } catch (clearFailure) {
      setClearError(clearFailure instanceof Error ? clearFailure.message : '清空对话记录失败，请重试。')
    } finally {
      setIsClearing(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-[#1e1e1e]"><Bot size={20} className="text-[#e1a300]" />AI 制造助手</h2>
          <p className="mt-0.5 text-sm text-[#787777]">只引用当前统一数据中心中仍存在的日报、异常和指标；建议会明确标注为分析建议。</p>
          {clearNotice && <p role="status" className="mt-2 text-sm text-[#3e3e3e]">{clearNotice}</p>}
        </div>
        <button type="button" disabled={!aiMessages.length || isResponding || isClearing} onClick={() => { setClearError(null); setClearNotice(null); setShowClearDialog(true) }} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-[#d5d5d5] bg-white px-3 py-2 text-xs font-medium text-[#3e3e3e] hover:border-[#950000] hover:text-[#950000] disabled:cursor-not-allowed disabled:opacity-50"><Trash2 size={14} />清空对话记录</button>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-[#d5d5d5] bg-white shadow-sm">
        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          {messages.map((message) => (
            <div key={message.id} className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${message.role === 'user' ? 'bg-[#fff8df] text-[#1e1e1e]' : 'bg-[#1e1e1e] text-[#fbc405]'}`}>
                {message.role === 'user' ? <User size={16} /> : <Bot size={16} />}
              </div>
              <div className={`max-w-2xl rounded-2xl border px-4 py-3 text-sm ${message.role === 'user' ? 'border-[#1e1e1e] bg-[#1e1e1e] text-white' : 'border-[#d5d5d5] bg-[#fdfcf8] text-[#1e1e1e]'}`}>
                <p className="whitespace-pre-line">{message.content}</p>
                {message.defaultRange && <p className="mt-2 text-xs text-[#787777]">统计范围：{message.defaultRange}</p>}
                {message.isSuggestion && <span className="mt-2 inline-block rounded bg-[#fff8df] px-2 py-1 text-xs font-semibold text-[#9b7000]">分析建议</span>}
                {message.role === 'assistant' && <EvidenceCards refs={message.evidenceRefs ?? []} />}
              </div>
            </div>
          ))}
          {isResponding && <div className="flex items-center gap-2 text-sm text-[#787777]"><Bot size={16} className="text-[#e1a300]" />正在基于已录入数据生成回答…</div>}
          <div ref={bottomRef} />
        </div>

        <div className="border-t border-[#d5d5d5] bg-[#f5f4f0] p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {QUICK_QUESTIONS.map((question) => (
              <button key={question} type="button" disabled={isResponding || loading} onClick={() => void submitQuestion(question)} className="flex items-center gap-1.5 rounded-full border border-[#d5d5d5] bg-white px-3 py-1.5 text-xs text-[#1e1e1e] transition-colors hover:border-[#e1a300] hover:bg-[#fff8df] disabled:cursor-not-allowed disabled:opacity-50"><Lightbulb size={12} className="text-[#e1a300]" />{question}</button>
            ))}
          </div>
          {error && <p role="alert" className="mb-2 text-xs text-[#950000]">{error}</p>}
          <div className="flex gap-2">
            <input value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void submitQuestion(input)} disabled={isResponding || loading} placeholder="输入问题，例如：昨天哪条产线 OEE 最低？" className="flex-1 rounded-xl border border-[#d5d5d5] bg-white px-4 py-2.5 text-sm outline-none focus:border-[#e1a300] disabled:bg-[#f5f4f0]" />
            <button type="button" disabled={isResponding || loading || !input.trim()} onClick={() => void submitQuestion(input)} className="rounded-xl bg-[#1e1e1e] px-4 py-2.5 text-[#fbc405] transition-colors hover:bg-[#333] disabled:cursor-not-allowed disabled:opacity-50" aria-label="发送问题"><Send size={18} /></button>
          </div>
        </div>
      </div>
      {showClearDialog && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" role="alertdialog" aria-modal="true" aria-labelledby="clear-ai-history-title" aria-describedby="clear-ai-history-description"><div className="w-full max-w-md rounded-2xl bg-white shadow-xl"><div className="border-b border-slate-100 p-6"><h3 id="clear-ai-history-title" className="text-lg font-bold text-slate-800">清空对话记录</h3><p id="clear-ai-history-description" className="mt-2 text-sm text-slate-600">将删除本浏览器中的全部 AI 提问与回复，无法恢复；不会删除日报、异常、行动和基础资料。</p></div><div className="p-6">{clearError && <p role="alert" className="text-sm text-[#950000]">{clearError}</p>}</div><div className="flex justify-end gap-3 border-t border-slate-100 p-6"><button type="button" disabled={isClearing} onClick={() => setShowClearDialog(false)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50">取消</button><button ref={confirmClearRef} type="button" disabled={isClearing} onClick={() => void clearMessages()} className="rounded-lg bg-[#950000] px-4 py-2 text-sm font-medium text-white hover:bg-[#760000] disabled:opacity-50">{isClearing ? '正在清空…' : '确认清空'}</button></div></div></div>}
    </div>
  )
}
