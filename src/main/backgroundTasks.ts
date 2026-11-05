/** Only UI-relevant fields cross IPC; full prompts and internal script data stay in main. */
export function backgroundTaskView(task: Record<string, any>) {
  const status = task.status === 'killed' ? 'stopped' : task.status
  return {
    task_id: task.task_id,
    task_type: task.task_type,
    description: task.description,
    status,
    summary: task.summary,
    agents: Array.isArray(task.workflow_progress) ? task.workflow_progress
      .filter((item: any) => item.type === 'workflow_agent')
      .map((item: any) => {
        const active = ['start', 'progress', 'running', 'queued', 'pending'].includes(item.state)
        const state = active && status === 'stopped' ? 'stopped'
          : item.state === 'start' && !item.startedAt ? 'queued'
          : ['start', 'progress'].includes(item.state) ? 'running' : item.state
        return { id: item.agentId ?? String(item.index), label: item.label, state, tokens: item.tokens }
      }) : []
  }
}
