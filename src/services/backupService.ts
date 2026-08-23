import type { DataSnapshot } from '../data/repository'

export type ManufacturingBackup = {
  format: 'manufacturing-operations-backup'
  version: 1
  exportedAt: string
  data: DataSnapshot
}

const fileTimestamp = (value: Date) => [
  value.getFullYear(),
  String(value.getMonth() + 1).padStart(2, '0'),
  String(value.getDate()).padStart(2, '0'),
  '-',
  String(value.getHours()).padStart(2, '0'),
  String(value.getMinutes()).padStart(2, '0'),
  String(value.getSeconds()).padStart(2, '0')
].join('')

/** Downloads every browser-local business record as a portable JSON backup. */
export function downloadDataBackup(data: DataSnapshot) {
  const exportedAt = new Date()
  const backup: ManufacturingBackup = {
    format: 'manufacturing-operations-backup',
    version: 1,
    exportedAt: exportedAt.toISOString(),
    data
  }
  const filename = `制造运营平台完整备份_${fileTimestamp(exportedAt)}.json`
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
  return filename
}
