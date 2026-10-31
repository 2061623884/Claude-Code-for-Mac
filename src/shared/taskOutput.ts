import type { UiMessage } from './chat'
export interface TaskOutput {
  messages: UiMessage[]
  text?: string
  truncated: boolean
  nextOffset?: number
  unavailable?: string
}
