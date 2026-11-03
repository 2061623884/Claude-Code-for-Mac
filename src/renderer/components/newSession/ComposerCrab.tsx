import { CRAB_GESTURES } from './crabGestures'
import { useEffect, useRef, useState } from 'react'
import type { ChatActivity, ChatState } from '@shared/chat'
import { Crab } from './Crab'
import { crabActivity } from './crabActivity'
import { useDesk } from '../../store'
import { SPINNER_VERBS_ZH, type SpinnerVerb } from './spinnerVerbsZh'
import { SPINNER_VERBS } from './spinnerVerbs'

export function nextVerb(previous?: string): SpinnerVerb {
  const pool = SPINNER_VERBS.filter(word => word !== previous)
  return pool[Math.floor(Math.random() * pool.length)]!
}

export function ComposerCrab({ state = 'idle', activity, hasDraft, rainbow, fast }: { fast?: boolean; rainbow?: boolean; state?: ChatState; activity?: ChatActivity; hasDraft: boolean }) {
  const language = useDesk((s): 'zh' | 'en' => s.settings?.executionLanguage === 'en' ? 'en' : 'zh')
  const display = crabActivity(state, activity, language)
  const [sleeping, setSleeping] = useState(false)
  const [rotation, setRotation] = useState(() => ({ word: nextVerb(), changes: 0 }))
  const previousFast = useRef(fast)
  const [runningSteps, setRunningSteps] = useState(false)
  useEffect(() => {
    const enabled = previousFast.current === false && fast === true
    previousFast.current = fast
    setRunningSteps(enabled)
    if (enabled) {
      const timer = setTimeout(() => setRunningSteps(false), 680)
      return () => clearTimeout(timer)
    }
  }, [fast])
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
  const gesture = display.rotating ? CRAB_GESTURES[rotation.word] : undefined
  const visualPose = gesture === 'thinking' ? 'thinking' : gesture ? 'working' : pose
  const shimmer = !rainbow && rotation.changes > 0 && rotation.changes % 4 === 0
  return <div className="composer-crab" data-composer-crab>
    <div className="crab-track">
      {fast && (runningSteps || display.rotating) && <span key={runningSteps ? 'start' : 'task'} aria-hidden="true" className={runningSteps ? 'crab-speed' : 'crab-speed crab-speed-task'}><i/><i/><i/></span>}
      <div className={runningSteps ? 'crab-run' : undefined}><Crab rainbow={rainbow} pose={visualPose} gesture={gesture} /></div>
    </div>
    <div className="composer-crab-label" aria-hidden="true" lang={language === 'zh' ? 'zh-CN' : 'en'}>
      {display.rotating && <span className="composer-crab-decoration"><span key={rotation.changes} className={`composer-crab-verb${shimmer ? ' composer-crab-shimmer' : ''}`}>{language === 'zh' ? SPINNER_VERBS_ZH[rotation.word] : rotation.word}…</span></span>}
      {!display.rotating && <span className="composer-crab-state">{display.label}</span>}
    </div>
    <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{display.label}</span>
  </div>
}
