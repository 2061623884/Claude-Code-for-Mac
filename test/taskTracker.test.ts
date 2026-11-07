import { expect, it } from 'vitest'
import { TaskTracker } from '../src/main/taskTracker'
const started = (patch: Record<string, unknown> = {}) => ({ type: 'system', subtype: 'task_started', task_id: 'a', task_type: 'local_agent', run_id: 'b', description: 'agent', is_backgrounded: true, ...patch })
const level = (tasks: unknown[]) => ({ type: 'system', subtype: 'background_tasks_changed', tasks })

it('rejects older runs and never revives a completed run with a late progress or start edge', () => {
  const tracker = new TaskTracker()
  tracker.apply(started())
  expect(tracker.apply({ type: 'system', subtype: 'task_notification', task_id: 'a', run_id: 'a', status: 'completed' })).toEqual([])
  expect(tracker.list()[0].status).toBe('running')
  tracker.apply({ type: 'system', subtype: 'task_notification', task_id: 'a', run_id: 'b', status: 'completed' })
  expect(tracker.apply(started())).toEqual([])
  expect(tracker.hasBackgroundWork()).toBe(false)
})

it('starts a new run with fresh timing, usage and output metadata', () => {
  let now = 10
  const tracker = new TaskTracker(() => now)
  tracker.apply(started({ usage: { total_tokens: 9 }, output_file: '/old' }))
  tracker.apply({ type: 'system', subtype: 'task_notification', task_id: 'a', run_id: 'b', status: 'completed' })
  now = 20
  tracker.apply(started({ run_id: 'c' }))
  expect(tracker.tasks.get('a')).toMatchObject({ run_id: 'c', startedAt: 20, status: 'running' })
  expect(tracker.tasks.get('a')).not.toHaveProperty('output_file')
  expect(tracker.tasks.get('a')).not.toHaveProperty('usage')
  expect(tracker.tasks.get('a')).not.toHaveProperty('endedAt')
})

it('does not let an older level entry remove a newer run first observed through an edge', () => {
  const tracker = new TaskTracker()
  tracker.apply(started({ run_id: 'c' }))
  tracker.apply(level([started({ run_id: 'b' })]))
  expect(tracker.list()[0].status).toBe('running')
  expect(tracker.tasks.get('a')?.run_id).toBe('c')
  expect(tracker.hasBackgroundWork()).toBe(true)
})

it('treats membership as authoritative independently of completion edge ordering', () => {
  const tracker = new TaskTracker()
  tracker.apply(level([started()]))
  tracker.apply({ type: 'system', subtype: 'task_notification', task_id: 'a', run_id: 'b', status: 'completed' })
  // Completion may precede removal from the membership set.
  expect(tracker.hasBackgroundWork()).toBe(true)
  tracker.apply(level([]))
  expect(tracker.hasBackgroundWork()).toBe(false)
  expect(tracker.list()[0].status).toBe('completed')
})

it('does not end a foreground agent when the background set changes', () => {
  const tracker = new TaskTracker()
  tracker.apply(started({ is_backgrounded: false }))
  tracker.apply(level([]))
  expect(tracker.tasks.get('a')?.status).toBe('running')
  expect(tracker.list()).toEqual([])
})

it('preserves a running task that explicitly moves from background to foreground', () => {
  const tracker = new TaskTracker()
  tracker.apply(level([started()]))
  tracker.apply({ type: 'system', subtype: 'task_updated', task_id: 'a', run_id: 'b', patch: { is_backgrounded: false } })
  tracker.apply(level([]))
  expect(tracker.tasks.get('a')?.status).toBe('running')
  expect(tracker.list()).toEqual([])
})

it('does not revive removed background work when an edge arrives late', () => {
  const tracker = new TaskTracker()
  tracker.apply(level([started()]))
  tracker.apply(level([]))
  tracker.apply(started())
  expect(tracker.hasBackgroundWork()).toBe(false)
  expect(tracker.list()[0].status).toBe('ended')
})

it('resets process membership without forgetting run ordering', () => {
  const tracker = new TaskTracker()
  tracker.remember('a', 'b', 'completed')
  tracker.reset()
  expect(tracker.list()).toEqual([])
  tracker.apply(started({ run_id: 'a' }))
  expect(tracker.list()).toEqual([])
  tracker.apply(started({ run_id: 'c' }))
  expect(tracker.hasBackgroundWork()).toBe(true)
})

it('allows authoritative membership to rejoin and updates ambient metadata without reviving terminal edges', () => {
  const tracker = new TaskTracker()
  tracker.apply(level([started()]))
  tracker.apply(level([]))
  tracker.apply(level([started()]))
  expect(tracker.list()[0].status).toBe('running')
  tracker.apply({ type: 'system', subtype: 'task_notification', task_id: 'a', run_id: 'b', status: 'completed' })
  tracker.apply(level([started({ ambient: true })]))
  expect(tracker.tasks.get('a')?.status).toBe('completed')
  expect(tracker.hasBackgroundWork()).toBe(false)
})
