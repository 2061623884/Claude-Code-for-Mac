// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { Dialog } from '../src/renderer/components/ui/Dialog'
import { useModal } from '../src/renderer/modalStore'
afterEach(cleanup)
it('keeps the modal state active until every mounted dialog is dismissed', () => {
  const first = render(<Dialog title="First" footer={null} onClose={() => {}}>First</Dialog>)
  const second = render(<Dialog title="Second" footer={null} onClose={() => {}}>Second</Dialog>)
  expect(useModal.getState().count).toBe(2)
  first.unmount()
  expect(useModal.getState().count).toBe(1)
  second.unmount()
  expect(useModal.getState().count).toBe(0)
})
it('makes repeated cleanup safe', () => {
  const unregister = useModal.getState().register()
  unregister(); unregister()
  expect(useModal.getState().count).toBe(0)
})
