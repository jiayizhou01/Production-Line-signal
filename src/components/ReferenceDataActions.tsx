import { useState } from 'react'
import { Pencil, Plus, X } from 'lucide-react'
import { appStore, useAppData } from '../store/appStore'
import { referenceDataLabels, type ReferenceDataKind } from '../services/referenceData'

type SavedReference = { value: string; defaultCtSeconds?: number }

export default function ReferenceDataActions({ kind, selectedValue, onSaved }: { kind: ReferenceDataKind; selectedValue?: string; onSaved?: (result: SavedReference, mode: 'create' | 'edit', previousValue?: string) => void }) {
  const { settings } = useAppData()
  const [mode, setMode] = useState<'create' | 'edit' | null>(null)
  const [name, setName] = useState('')
  const [ctSeconds, setCtSeconds] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const label = referenceDataLabels[kind]
  const selectedName = kind === 'anomalyType' ? settings?.anomalyTypes.find((item) => item.id === selectedValue)?.name : selectedValue
  const open = (nextMode: 'create' | 'edit') => {
    setMode(nextMode)
    setError(null)
    setName(nextMode === 'edit' ? selectedName ?? '' : '')
    setCtSeconds(kind === 'productModel' && nextMode === 'edit' ? String(settings?.defaultCtSeconds[selectedValue ?? ''] ?? '') : '')
  }
  const close = () => { if (!saving) setMode(null) }
  const save = async () => {
    if (!mode) return
    try {
      setSaving(true)
      setError(null)
      const result = await appStore.saveReferenceData({ kind, mode, value: name, previousValue: mode === 'edit' ? selectedValue : undefined, defaultCtSeconds: kind === 'productModel' ? Number(ctSeconds) : undefined })
      onSaved?.({ value: result.value, defaultCtSeconds: result.defaultCtSeconds }, mode, selectedValue)
      setMode(null)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : `${label}保存失败，请重试。`)
    } finally {
      setSaving(false)
    }
  }

  return <>
    <span className="ml-1 inline-flex h-5 shrink-0 items-center gap-0 align-middle">
      <button type="button" onClick={() => open('create')} className="inline-flex h-5 items-center gap-0.5 rounded px-1 py-0 text-[11px] font-medium leading-5 text-[#9b7000] hover:bg-[#fff8df] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e1a300]" aria-label={`新增${label}`}><Plus size={12} />新增</button>
      <button type="button" onClick={() => open('edit')} disabled={!selectedValue} className="inline-flex h-5 items-center gap-0.5 rounded px-1 py-0 text-[11px] font-medium leading-5 text-[#545454] hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#545454] disabled:cursor-not-allowed disabled:opacity-35" aria-label={`编辑${label}`}><Pencil size={11} />编辑</button>
    </span>
    {mode && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="reference-data-title" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
      <div className="w-full max-w-sm rounded-xl border border-[#d5d5d5] bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-[#e5e3dc] px-5 py-4"><h3 id="reference-data-title" className="font-bold text-[#1e1e1e]">{mode === 'create' ? `新增${label}` : `编辑${label}`}</h3><button type="button" onClick={close} disabled={saving} className="rounded p-1 text-[#787777] hover:bg-[#f5f4ef] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#e1a300]" aria-label="关闭"><X size={17} /></button></div>
        <div className="space-y-4 px-5 py-4">
          <div><label className="mb-1 block text-sm font-medium text-[#1e1e1e]">{label}</label><input autoFocus value={name} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') close(); if (event.key === 'Enter') void save() }} maxLength={80} className="w-full rounded-lg border border-[#d5d5d5] px-3 py-2 text-sm outline-none focus:border-[#e1a300] focus:ring-2 focus:ring-[#e1a300]/25" placeholder={`请输入${label}`} /></div>
          {kind === 'productModel' && <div><label className="mb-1 block text-sm font-medium text-[#1e1e1e]">默认 CT（秒）</label><input type="number" min="0.1" step="0.1" value={ctSeconds} onChange={(event) => setCtSeconds(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') close(); if (event.key === 'Enter') void save() }} className="w-full rounded-lg border border-[#d5d5d5] px-3 py-2 text-sm outline-none focus:border-[#e1a300] focus:ring-2 focus:ring-[#e1a300]/25" placeholder="例如 28.8" /></div>}
          {error && <p role="alert" className="text-sm text-[#950000]">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 border-t border-[#e5e3dc] px-5 py-4"><button type="button" onClick={close} disabled={saving} className="rounded-lg border border-[#d5d5d5] px-3 py-2 text-sm font-medium text-[#1e1e1e] hover:bg-[#f5f4ef] disabled:opacity-50">取消</button><button type="button" onClick={() => void save()} disabled={saving} className="rounded-lg bg-[#fbc405] px-3 py-2 text-sm font-semibold text-[#1e1e1e] hover:bg-[#e1a300] disabled:cursor-not-allowed disabled:opacity-50">{saving ? '保存中…' : '保存'}</button></div>
      </div>
    </div>}
  </>
}
