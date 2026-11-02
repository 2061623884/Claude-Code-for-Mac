import { useEffect, useState } from 'react'
import type { ChatActivity, ChatState } from '@shared/chat'
import { Crab } from './Crab'
import { crabActivity } from './crabActivity'
import { SPINNER_VERBS } from './spinnerVerbs'

export function nextVerb(previous?: string): string {
  const pool = SPINNER_VERBS.filter(word => word !== previous)
  return pool[Math.floor(Math.random() * pool.length)]!
}

export function ComposerCrab({ state = 'idle', activity, hasDraft }: { state?: ChatState; activity?: ChatActivity; hasDraft: boolean }) {
  const display = crabActivity(state, activity)
  const [sleeping, setSleeping] = useState(false)
  const [rotation, setRotation] = useState(() => ({ word: nextVerb(), changes: 0 }))
  const canSleep = state === 'idle' && !hasDraft
  useEffect(() => {
    setSleeping(false)
    if (!canSleep) return
    const timer = setTimeout(() => setSleeping(true), 30_000)
    return () => clearTimeout(timer)
  }, [canSleep])
  useEffect(() => {
    if (state === 'idle' || state === 'error') setRotation({ word: nextVerb(), changes: 0 })
  }, [state])
  useEffect(() => {
    if (!display.rotating) return
    const timer = setInterval(() => setRotation(previous => ({ word: nextVerb(previous.word), changes: previous.changes + 1 })), 8_000)
    return () => clearInterval(timer)
  }, [display.rotating])
  const pose = state === 'idle' ? hasDraft ? 'look' : sleeping ? 'sleep' : 'idle' : display.pose
  const shimmer = rotation.changes > 0 && rotation.changes % 4 === 0
  return <div className="composer-crab" data-composer-crab>
    <Crab pose={pose} />
    <div className="composer-crab-label" aria-hidden="true">
      {display.rotating && <span className="composer-crab-decoration"><span key={rotation.changes} className={`composer-crab-verb${shimmer ? ' composer-crab-shimmer' : ''}`}>{rotation.word}…</span></span>}
      {!display.rotating && <span className="composer-crab-state">{display.label}</span>}
    </div>
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{display.label}</span>
  </div>
}
