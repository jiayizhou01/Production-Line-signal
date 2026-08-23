export type CsvColumn<T> = {
  header: string
  value: (row: T) => string | number | null | undefined
}

const escapeCsv = (value: string | number | null | undefined) => {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export async function downloadCsv<T>(filename: string, columns: CsvColumn<T>[], rows: T[]) {
  if (!rows.length) throw new Error('没有可导出的记录。')

  const content = [
    columns.map((column) => escapeCsv(column.header)).join(','),
    ...rows.map((row) => columns.map((column) => escapeCsv(column.value(row))).join(','))
  ].join('\r\n')
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
  return { filename, count: rows.length }
}
