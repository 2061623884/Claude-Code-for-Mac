import { useMenuRoom } from '../../hooks/useMenuRoom'
import { useEffect, useId, useRef, useState } from 'react'
import { Box, Brain, Check, ChevronDown } from 'lucide-react'
import type { SessionOptions, RuntimeSettings } from '@shared/chat'
import { EFFORT_LEVELS } from '@shared/format'
import { useDesk } from '../../store'
import { useDismiss } from '../../hooks/useDismiss'
import { useModelCatalog } from './useModelCatalog'

function WingedShoe() {
  return <svg aria-hidden="true" width="16" height="16" viewBox="308 275 665 642"><g fill="none" stroke="currentColor" strokeWidth="25" strokeLinecap="round" strokeLinejoin="round">
<path d="M646 460 Q631 392 685 361 C719 339 762 329 791 310 Q811 299 822 317 Q838 358 776 389 Q814 373 809 400 Q806 434 747 439 Q783 428 777 451 Q769 483 731 487"/>
<path d="M344 799 C347 749 392 707 432 670 Q477 602 504 522 Q518 454 574 472 Q621 478 645 529 C665 519 685 515 689 506 Q672 490 641 505 M616 484 C666 442 715 452 729 491 Q752 548 666 573"/>
<path d="M745 643 C693 615 767 507 811 485 C846 463 881 448 906 435 Q930 426 938 452 Q948 495 872 527 Q911 513 916 541 Q914 575 840 576 Q882 575 872 600 Q852 644 785 616 Q772 642 745 643Z"/>
<path d="M735 504 Q741 525 746 546 M645 529 Q612 551 596 577 M486 558 Q543 542 621 611 M462 603 Q520 593 580 648 M429 655 Q481 646 544 693 M392 710 Q478 700 532 798"/>
<path d="M344 797 C378 847 467 829 535 800 C601 772 638 723 695 691 Q735 671 753 638 M344 795 C327 861 362 895 428 893 C527 896 586 862 649 800 Q698 755 735 734 Q781 708 765 641"/>
<path strokeWidth="20" d="m808 712 38-14 m-59 66 47-6 m-98 42 42 12"/></g></svg>
}

export function ModePicker({ options, runtime, live, cwd, busy, onChange, onRetry, inline }: {
  inline?: 'model' | 'effort' | 'defaults' | 'defaultModel'; options: SessionOptions; runtime?: RuntimeSettings; live?: boolean; cwd?: string; busy?: boolean
  onChange(patch: Partial<SessionOptions>): void; onRetry?(): void
}) {
  const fastHintId = useId()
  const demo = useDesk(s => s.demo)
  const { models, loading, error, cached, retry } = useModelCatalog(cwd)
  type Kind = 'model' | 'effort'
  const [open, setOpen] = useState<Kind | null>(demo?.openMenu === 'model' || demo?.openMenu === 'effort' ? demo.openMenu : null)
  const ref = useRef<HTMLDivElement>(null)
  const [closing, setClosing] = useState<Kind | null>(null)
  const room = useMenuRoom(ref, !!open)
  function close() {
    setClosing(open)
    setOpen(null)
  }
  useDismiss(ref, !!open, close)
  useEffect(() => {
    if (!closing) return
    const timer = setTimeout(() => setClosing(null), 120)
    return () => clearTimeout(timer)
  }, [closing])
  const model = models.find(m => m.value === options.model || (m.resolvedModel && m.resolvedModel === options.model))
  const modelLabel = model?.label ?? options.model ?? '默认模型'
  const levels = [{ value: null, label: '自动', description: '跟随当前模型的默认思考程度' }, ...EFFORT_LEVELS.filter(l => model?.efforts.includes(l.value))]
  const effortLabel = EFFORT_LEVELS.find(l => l.value === options.effort)?.label ?? '自动'
  const fast = live ? runtime?.fastMode === 'on' : !!options.fastMode
  const ultra = live ? runtime?.ultracode === true : !!options.ultracode
  const unavailable = runtime?.ultracodeAvailable === false
  const kinds: Kind[] = inline === 'defaults' || inline === 'effort' ? ['effort'] : inline === 'model' || inline === 'defaultModel' ? ['model'] : ['model','effort']
  return <div ref={ref} className="flex items-center gap-1">
    {kinds.map(kind => {
      const modelMenu = kind === 'model'
      const title = modelMenu ? '模型' : '思考程度'
      const embedded = inline === kind
      const expanded = embedded || open === kind
      const choose = (patch: Partial<SessionOptions>) => { onChange(patch); close() }
      return <div key={kind} className="relative">
        {!embedded && <button type="button" aria-label={'选择'+title} aria-expanded={expanded} onClick={() => { if (expanded) close(); else { setClosing(null); setOpen(kind) } }}
          className="flex h-7 items-center gap-1 rounded-lg px-2 text-xs text-fg2 hover:bg-hover aria-expanded:bg-hover">{modelMenu ? <Box size={14}/> : <Brain size={14}/>} {modelMenu ? modelLabel : effortLabel}<ChevronDown size={12}/></button>}
        {(expanded || closing === kind) && <div aria-label={expanded ? title+'列表' : undefined} aria-hidden={!expanded} inert={!expanded}
          style={embedded || room === undefined ? undefined : {maxHeight: `min(62vh, ${room}px)`}} className={'w-[280px] max-w-[85vw] max-h-[62vh] overflow-auto rounded-xl border border-line bg-card p-1 shadow-pop ' + (embedded ? 'relative' : 'absolute z-40 bottom-full mb-2 origin-bottom '+(expanded ? 'animate-menu-in ' : 'picker-closing ')+(inline === 'defaults' || inline === 'defaultModel' ? 'right-0' : 'left-0'))}>
          {loading && models.length === 0 && <p className="px-2 py-1 text-fg3">正在读取模型…</p>}
          {error && <button className="picker-option" onClick={retry}>模型读取失败 · 重试</button>}
          {!loading && !error && models.length === 0 && <button className="picker-option" onClick={retry}>没有可用模型 · 重试</button>}
          {cached && models.length > 0 && <p role="status" className="px-2 py-1 text-fg3">{loading ? '显示上次结果，正在校验…' : '显示上次结果'}</p>}
          {modelMenu ? <div>
            {models.map(m => <button key={m.value} aria-label={m.label} disabled={busy} aria-pressed={model?.value===m.value} className="picker-option" onClick={() => choose({model:m.value})}><span className="model-choice-name">{m.label}</span>{model?.value===m.value && <Check size={14}/>}</button>)}
            {inline !== 'defaultModel' && <div className="picker-option picker-divider fast-option"><span className="model-choice-name flex items-center gap-2">Fast<WingedShoe/></span>
              <span className="fast-checkbox">
                <input type="checkbox" aria-label="Fast" aria-describedby={fastHintId} checked={fast} disabled={busy}
                  className="accent-accent" onChange={event => onChange({fastMode: event.target.checked})}/>
                <span id={fastHintId} role="tooltip" className="fast-hint"><strong>更快响应</strong>开启后将消耗更多用量</span>
              </span>
            </div>}
            {runtime?.fastModeReason==='extra_usage_disabled' && <p className="px-2 text-xs text-fg3">额外用量未启用</p>}
          </div> : <div>
            {levels.map(l => <button key={l.value ?? 'auto'} aria-label={l.label} disabled={busy} aria-pressed={l.value===options.effort} className="picker-option" onClick={() => choose({effort:l.value})}><span>{l.label}<small>{l.description}</small></span>{l.value===options.effort && <Check size={14}/>}</button>)}
            {inline !== 'defaults' && <label className="picker-option picker-divider"
              title={unavailable && !runtime?.workflowAction ? runtime?.ultraReason : undefined}>
              Ultracode<input type="checkbox" aria-label="Ultracode" checked={ultra}
                disabled={busy || (unavailable && !runtime?.workflowAction && !ultra)}
                onChange={event => onChange({ ultracode: event.target.checked })}/>
            </label>}
            {runtime?.error && <button className="picker-option" onClick={onRetry}>状态未确认 · 重试</button>}
          </div>}
        </div>}
      </div>
    })}
  </div>
}
