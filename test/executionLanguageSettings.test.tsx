// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SettingsPage } from '../src/renderer/components/settings/SettingsPage'
import { useDesk } from '../src/renderer/store'
beforeEach(() => {
 useDesk.setState({ view: { kind: 'settings', tab: 'general' }, projects: [], settings: { theme: 'system', defaultModel: 'opus', defaultEffort: 'medium', defaultPermissionMode: 'default', claudePath: null, allowBypass: false } })
 window.desk = { settings: { set: vi.fn(async (patch: Partial<import('../src/shared/types').Settings>) => ({ ...useDesk.getState().settings!, ...patch })) } } as unknown as Window['desk']
})
afterEach(cleanup)
it('exposes only two languages and saves through existing local settings', async () => {
 render(<SettingsPage />)
 const select = screen.getByLabelText('执行提示语言') as HTMLSelectElement
 expect([...select.options].map(o => o.value)).toEqual(['zh','en'])
 expect(select.value).toBe('zh')
 fireEvent.change(select, { target: { value: 'en' } })
 await waitFor(() => expect(select.value).toBe('en'))
 expect(window.desk.settings.set).toHaveBeenCalledWith({ executionLanguage: 'en' })
})
it('keeps the old language and reports a failed save', async () => {
 vi.mocked(window.desk.settings.set).mockRejectedValue(new Error('disk full'))
 render(<SettingsPage />)
 const select = screen.getByLabelText('执行提示语言') as HTMLSelectElement
 fireEvent.change(select, { target: { value: 'en' } })
 expect((await screen.findByRole('alert')).textContent).toBe('disk full')
 expect(select.value).toBe('zh')
 expect(select.disabled).toBe(false)
})
