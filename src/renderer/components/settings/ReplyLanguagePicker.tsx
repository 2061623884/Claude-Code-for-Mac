import { useState } from 'react'
import { settingsButtonClass, settingsInputClass } from './SettingsControls'

const LANGUAGES = [
  ['default', '自动（不指定语言）'],
  ['简体中文', '简体中文'], ['繁體中文', '繁体中文'],
  ['English', '英语'], ['Japanese', '日语'], ['Korean', '韩语'],
  ['French', '法语'], ['German', '德语'], ['Spanish', '西班牙语'],
  ['Portuguese', '葡萄牙语'], ['Arabic', '阿拉伯语']
] as const
const EXISTING_LABELS: Record<string, string> = {
  Chinese: '中文', 'Simplified Chinese': '简体中文', 'Traditional Chinese': '繁体中文',
  'zh-CN': '简体中文', 'zh-TW': '繁体中文', en: '英语', ja: '日语', ko: '韩语'
}
const CUSTOM = '__desktop_custom_language__'

/** Native language accepts free text. Presets are conveniences, not a closed capability list. */
export function ReplyLanguagePicker({ id, value, disabled, onSave }: { id: string; value: string | null; disabled: boolean; onSave(value: string): void }) {
  const [custom, setCustom] = useState(false)
  const [draft, setDraft] = useState('')
  const known = LANGUAGES.some(([key]) => key === value)
  return <div className="flex max-w-full flex-col items-end gap-2">
    <select id={id} value={custom ? CUSTOM : value ?? ''} disabled={disabled} className={settingsInputClass} onChange={event => {
      const next = event.target.value
      if (next === CUSTOM) { setDraft(value && value !== 'default' ? value : ''); setCustom(true) }
      else { setCustom(false); if (next !== value) onSave(next) }
    }}>
      {value === null && <option value="" disabled>无法确认当前值</option>}
      {LANGUAGES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      {value !== null && !known && <option value={value}>{EXISTING_LABELS[value] ?? `自定义：${value}`}</option>}
      <option value={CUSTOM}>其他语言…</option>
    </select>
    {custom && <form className="flex max-w-full gap-2" onSubmit={event => {
      event.preventDefault()
      if (!disabled && draft.trim() && !/[\r\n]/.test(draft)) onSave(draft.trim())
    }}>
      <input aria-label="自定义回复语言" value={draft} disabled={disabled} placeholder="例如：意大利语、ไทย" onChange={event => setDraft(event.target.value)} className={`${settingsInputClass} min-w-0 w-40`} />
      <button type="submit" disabled={disabled || !draft.trim() || draft.trim() === value || /[\r\n]/.test(draft)} className={settingsButtonClass}>保存</button>
    </form>}
  </div>
}
