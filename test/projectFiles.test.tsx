// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ProjectEntry } from '../src/shared/types'
import { ProjectFilesPane } from '../src/renderer/components/right/ProjectFilesPane'
import { useLayout } from '../src/renderer/layoutStore'

const rootEntries: ProjectEntry[] = [
  { path: '/project/src', name: 'src', kind: 'dir' },
  { path: '/project/README.md', name: 'README.md', kind: 'file' }
]

beforeEach(() => {
  useLayout.getState().activateSession('test', 'p')
  window.desk = {
    files: {
      list: vi.fn((_projectPath: string, directory: string) =>
        Promise.resolve(directory === '/project/src' ? [{ path: '/project/src/main.ts', name: 'main.ts', kind: 'file' }] : rootEntries)
      )
    }
  } as unknown as Window['desk']
})

afterEach(() => {
  cleanup()
  Reflect.deleteProperty(window, 'desk')
})

describe('ProjectFilesPane', () => {
  it('loads directories on demand', async () => {
    render(<ProjectFilesPane cwd="/project" refreshKey={0} />)
    expect(await screen.findByRole('button', { name: 'src' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'src' }))

    expect(await screen.findByRole('button', { name: 'main.ts' })).toBeTruthy()
    expect(window.desk.files.list).toHaveBeenCalledWith('/project', '/project/src')
  })

  it('opens a file in a right-side preview tab', async () => {
    render(<ProjectFilesPane cwd="/project" refreshKey={0} />)

    fireEvent.click(await screen.findByRole('button', { name: 'README.md' }))

    await waitFor(() => expect(useLayout.getState().rightTab).toBe('file:/project/README.md'))
  })
})
