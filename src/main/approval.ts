import type { PermissionResult, PermissionUpdate } from '@anthropic-ai/claude-agent-sdk'
import type { Decision } from '../shared/chat'

/** 把界面上的选择翻译成 SDK canUseTool 需要的返回值 */
export function toPermissionResult(
  decision: Decision,
  input: Record<string, unknown>,
  suggestions?: PermissionUpdate[]
): PermissionResult {
  switch (decision.type) {
    case 'allow':
    case 'planApprove':
      return { behavior: 'allow', updatedInput: input }
    case 'allowAlways':
      return { behavior: 'allow', updatedInput: input, updatedPermissions: suggestions ?? [] }
    case 'deny':
      return decision.message
        ? { behavior: 'deny', message: decision.message }
        : { behavior: 'deny', message: '用户拒绝了这个操作，请停下来等待进一步指示。', interrupt: true }
    case 'answers':
      return { behavior: 'allow', updatedInput: { ...input, answers: decision.answers } }
    case 'planRevise':
      return { behavior: 'deny', message: `用户没有批准计划，希望继续完善：${decision.feedback}` }
  }
}
