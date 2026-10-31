import * as store from './store'
import { recordCompletion, updateOrganization, type OrganizationAction } from '../shared/sessionOrganization'
export const organization = () => store.read().organization
export function changeOrganization(action: OrganizationAction) {
  const next = updateOrganization(organization(), action)
  if (next !== organization())
    store.update((d) => {
      d.organization = next
    })
  return organization()
}
export function completeSession(id: string, eventId: string) {
  const next = recordCompletion(organization(), id, eventId)
  if (next !== organization())
    store.update((d) => {
      d.organization = next
    })
  return organization()
}
