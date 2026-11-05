import { useChat } from './chatStore'
import { notifyIfAway } from './notify'
import { useSessionMarks } from './sessionMarks'
import { refreshSessionsInBackground, useDesk } from './store'

/** Connect session state to desktop notifications and the Dock for the lifetime of the renderer. */
export function connectSessionSignals(): () => void {
  const { app, chat } = window.desk
  let lastBadge: boolean | undefined
  const syncBadge = (): void => {
    const { projects, sessions } = useDesk.getState()
    const { unread } = useSessionMarks.getState()
    const hasUnread = projects.some(project => sessions[project.id]?.some(session => !session.archived && unread[session.id]))
    if (lastBadge === hasUnread) return
    lastBadge = hasUnread
    void app.setDockUnread(hasUnread).catch(error => console.error('[dock badge]', error))
  }

  const stopDesk = useDesk.subscribe((state, previous) => {
    if (state.projects !== previous.projects || state.sessions !== previous.sessions) syncBadge()
  })
  const stopMarks = useSessionMarks.subscribe((state, previous) => {
    if (state.unread !== previous.unread) syncBadge()
  })
  const stopClick = app.onNotificationClick(sessionId => {
    const { projects, sessions, setView } = useDesk.getState()
    const cached = useChat.getState().chats[sessionId]?.projectId
    const project = projects.find(project => project.id === cached)
      ?? projects.find(project => sessions[project.id]?.some(session => session.id === sessionId))
    if (project) setView({ kind: 'session', sessionId, projectId: project.id })
  })
  const stopEvents = chat.onEvent((sessionId, event) => {
    if (!useChat.getState().handle(sessionId, event)) return
    if (event.kind === 'result') {
      const projectId = useChat.getState().chats[sessionId]?.projectId
      if (projectId) refreshSessionsInBackground(projectId)
    }
    notifyIfAway(sessionId, event)
  })
  syncBadge()
  return () => {
    stopEvents()
    stopClick()
    stopMarks()
    stopDesk()
  }
}
