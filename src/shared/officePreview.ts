export interface SheetInfo { name: string; rows: number; columns: number }
export interface SheetRange { sheet: number; row: number; column: number; rows: number; columns: number; requestId: number }
export type OfficeRequest = { kind: 'load'; format: 'docx' | 'spreadsheet'; data: Uint8Array } | ({ kind: 'range' } & SheetRange)
export type OfficeResponse = { kind: 'docx'; html: string } | { kind: 'sheets'; sheets: SheetInfo[] }
  | { kind: 'range'; requestId: number; values: string[][] } | { kind: 'error'; message: string }
