// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SessionOptions } from '../src/shared/chat'
import { BtwPane } from '../src/renderer/components/right/BtwPane'
import { useBtw } from '../src/renderer/btwStore'

const options: SessionOptions = { model: null, mode: 'default', effort: null }

beforeEach(() => {
  useBtw.setState({ threads: {} })
  window.desk = {
    chat: {
      btw: vi.fn().mockResolvedValue('answer')
    }
  } as unknown as Window['desk']
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'desk')
})

describe('BtwPane empty conversation prompt', () => {
  it('shows the intro when the panel is first opened', async () => {
    const { rerender } = render(
      <BtwPane sessionId="btw-intro-1" cwd="/tmp" options={options} active={false} />
    )
    expect(screen.queryByRole('button', { name: '向我提问' })).toBeNull()

    rerender(<BtwPane sessionId="btw-intro-1" cwd="/tmp" options={options} active />)

    expect(await screen.findByRole('button', { name: '向我提问' })).toBeTruthy()
  })

  it('shows the intro again after closing and reopening an empty conversation', async () => {
    const { rerender } = render(
      <BtwPane sessionId="btw-intro-2" cwd="/tmp" options={options} active={false} />
    )
    rerender(<BtwPane sessionId="btw-intro-2" cwd="/tmp" options={options} active />)
    expect(await screen.findByRole('button', { name: '向我提问' })).toBeTruthy()

    rerender(<BtwPane sessionId="btw-intro-2" cwd="/tmp" options={options} active={false} />)
    rerender(<BtwPane sessionId="btw-intro-2" cwd="/tmp" options={options} active />)

    expect(await screen.findByRole('button', { name: '向我提问' })).toBeTruthy()
  })

  it('focuses the input when the intro is clicked', async () => {
    render(<BtwPane sessionId="btw-intro-3" cwd="/tmp" options={options} active />)
    const intro = await screen.findByRole('button', { name: '向我提问' })

    fireEvent.click(intro)

    expect(document.activeElement).toBe(screen.getByRole('textbox'))
  })

  it('hides the intro after the first question is submitted', async () => {
    const { rerender } = render(<BtwPane sessionId="btw-intro-4" cwd="/tmp" options={options} active />)
    await screen.findByRole('button', { name: '向我提问' })
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '解释一下' } })

    fireEvent.click(screen.getByRole('button', { name: '提问' }))

    await waitFor(() => expect(screen.queryByRole('button', { name: '向我提问' })).toBeNull())
    await screen.findByText('answer')
    rerender(<BtwPane sessionId="btw-intro-4" cwd="/tmp" options={options} active={false} />)
    rerender(<BtwPane sessionId="btw-intro-4" cwd="/tmp" options={options} active />)
    expect(screen.queryByRole('button', { name: '向我提问' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '清空' }))
    expect(screen.getByRole('button', { name: '向我提问' })).toBeTruthy()
  })

  it('keeps the intro after typing a draft and remounting without sending', () => {
    const first = render(<BtwPane sessionId="btw-empty" cwd="/tmp" options={options} active />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '尚未发送' } })
    expect(screen.getByRole('button', { name: '向我提问' })).toBeTruthy()
    first.unmount()
    render(<BtwPane sessionId="btw-empty" cwd="/tmp" options={options} active />)
    expect(screen.getByRole('button', { name: '向我提问' })).toBeTruthy()
  })
})
