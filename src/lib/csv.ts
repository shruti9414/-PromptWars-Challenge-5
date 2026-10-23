/** Minimal CSV encode/decode. No dependency: this is the only place that needs it. */

function toCsvField(value: string | number): string {
  const s = String(value)
  return /["\n\r,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header: string[], rows: (string | number)[][]): string {
  return [header, ...rows].map((r) => r.map(toCsvField).join(',')).join('\r\n')
}

/** Handles quoted fields, escaped `""`, and commas/newlines inside quotes. Trailing blank lines are dropped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let sawAny = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else { inQuotes = false }
      } else {
        field += c
      }
      continue
    }
    if (c === '"') { inQuotes = true; sawAny = true; continue }
    if (c === ',') { row.push(field); field = ''; sawAny = true; continue }
    if (c === '\r') continue
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; sawAny = false; continue }
    field += c
    sawAny = true
  }
  if (sawAny || field !== '' || row.length > 0) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]): void {
  const blob = new Blob([toCsv(header, rows)], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export const CSV_MAX_BYTES = 2 * 1024 * 1024

/** Rejects anything that isn't plausibly a small CSV file before it's ever read. */
export function validateCsvFile(file: File): string | null {
  const name = file.name.toLowerCase()
  if (!name.endsWith('.csv') && file.type !== 'text/csv' && file.type !== 'application/vnd.ms-excel') {
    return 'Choose a .csv file.'
  }
  if (file.size === 0) return 'That file is empty.'
  if (file.size > CSV_MAX_BYTES) return 'That file is too large (max 2 MB).'
  return null
}

/** Looks up a column by header name, case-insensitively, tolerating extra whitespace. */
export function colIndex(header: string[], name: string): number {
  const target = name.trim().toLowerCase()
  return header.findIndex((h) => h.trim().toLowerCase() === target)
}
