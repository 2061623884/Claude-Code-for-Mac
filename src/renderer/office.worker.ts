/// <reference lib="webworker" />
import type { OfficeRequest, OfficeResponse } from '@shared/officePreview'
import type { WorkBook } from 'xlsx'
let workbook: WorkBook | undefined
let xlsx: typeof import('xlsx') | undefined
const send = (message: OfficeResponse): void => self.postMessage(message)
self.onmessage = async (event: MessageEvent<OfficeRequest>) => {
  const message = event.data
  try {
    if (message.kind === 'load') {
      if (message.format === 'docx') {
        const mammoth = await import('mammoth/mammoth.browser')
        const result = await mammoth.convertToHtml({ arrayBuffer: message.data.buffer as ArrayBuffer }, { externalFileAccess: false })
        send({ kind: 'docx', html: result.value })
      } else {
        xlsx = await import('xlsx')
        workbook = xlsx.read(message.data, { type: 'array', cellHTML: false, cellFormula: true, cellText: true, bookVBA: false })
        send({ kind: 'sheets', sheets: workbook.SheetNames.map((name) => {
          const ref = workbook!.Sheets[name]['!ref']
          const range = ref ? xlsx!.utils.decode_range(ref) : null
          return { name, rows: range ? Math.min(range.e.r + 1, 1048576) : 0, columns: range ? Math.min(range.e.c + 1, 16384) : 0 }
        }) })
      }
    } else if (workbook && xlsx) {
      const sheet = workbook.Sheets[workbook.SheetNames[message.sheet]]
      if (!sheet) throw new Error('工作表不存在')
      const values = Array.from({ length: Math.min(message.rows, 150) }, (_, r) => Array.from({ length: Math.min(message.columns, 50) }, (_, c) => {
        const cell = sheet[xlsx!.utils.encode_cell({ r: message.row + r, c: message.column + c })]
        if (!cell) return ''
        if (cell.f && cell.v === undefined) return `=${cell.f}（无缓存结果）`
        return cell.w ?? xlsx!.utils.format_cell(cell)
      }))
      send({ kind: 'range', requestId: message.requestId, values })
    }
  } catch (error) {
    send({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
