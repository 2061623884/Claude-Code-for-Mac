// @vitest-environment jsdom
import React from 'react'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SessionRow } from '../src/renderer/components/sidebar/SessionRow'
import { useSessionMarks } from '../src/renderer/sessionMarks'
import type { ChatState } from '../src/shared/chat'

const session = { id: 's', title: '会话', cwd: '/p', lastModified: Date.now(), archived: false }
const row = (status?: ChatState) => <SessionRow session={session} active={false} status={status} onOpen={() => {}} onRename={() => {}} onArchive={() => {}} />

vi.hoisted(() => {
  const data = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) }
  } })
})
beforeEach(() => useSessionMarks.setState({ pinned: [], unread: {} }))
afterEach(cleanup)

it('shows a gray spinner while running and an orange dot once the reply is unread', () => {
  const { rerender } = render(row('running'))
  const spinner = screen.getByRole('status', { name: '运行中' })
  expect(spinner.getAttribute('class')).toContain('animate-spin')
  expect(spinner.getAttribute('class')).toContain('text-fg3')

  useSessionMarks.getState().complete('s')
  rerender(row('running'))
  expect(screen.queryByLabelText('有未读回复')).toBeNull()

  rerender(row('idle'))
  expect(screen.queryByRole('status', { name: '运行中' })).toBeNull()
  expect(screen.getByLabelText('有未读回复').className).toContain('bg-accent')
})
