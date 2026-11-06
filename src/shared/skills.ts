/** 技能来源：个人 ~/.claude、项目 .claude、claude.ai 账号同步、已安装插件 */
export type SkillSource = 'user' | 'project' | 'synced' | 'plugin'

export interface SkillInfo {
  /** 斜杠调用名，插件内的为 plugin:name */
  name: string
  description: string
  kind: 'skill' | 'command'
  source: SkillSource
  /** SKILL.md 或命令文件的绝对路径 */
  path: string
  /** 所属插件 id（name@marketplace） */
  plugin?: string
}

export interface PluginInfo {
  id: string
  name: string
  marketplace?: string
  version?: string
  description?: string
  enabled: boolean
  /** 当前项目的 .claude/settings*.json 决定了启用状态，用户级开关不生效 */
  projectOverride: boolean
  path: string
}

export interface SkillCatalog {
  skills: SkillInfo[]
  plugins: PluginInfo[]
}

export interface SkillDraft {
  name: string
  /** 做什么 */
  purpose: string
  /** 什么时候该用（决定 Claude 是否自动调用） */
  trigger: string
  /** 步骤、规范、示例等补充要求 */
  details: string
  location: 'user' | 'project'
  /** 有 skill-creator 技能时用它的斜杠命令开头 */
  creator?: string
}

export const SKILL_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** 新建技能的提示词：交给新对话里的 Claude 去写 SKILL.md */
export function buildSkillPrompt(draft: SkillDraft): string {
  const name = draft.name.trim()
  const path = draft.location === 'user' ? `~/.claude/skills/${name}/SKILL.md` : `.claude/skills/${name}/SKILL.md（当前项目内）`
  const lines = [
    '请帮我创建一个 Claude Code 技能（Skill）。',
    '',
    `- 名称：${name}`,
    `- 保存位置：${path}`,
    `- 用途：${draft.purpose.trim()}`
  ]
  if (draft.trigger.trim()) lines.push(`- 何时使用：${draft.trigger.trim()}`)
  if (draft.details.trim()) lines.push('- 补充要求：', ...draft.details.trim().split('\n').map(line => `  ${line}`))
  lines.push(
    '',
    '要求：',
    '1. SKILL.md 以 YAML frontmatter 开头，包含 name 和 description；description 用一两句话写清楚做什么、什么时候该用，Claude 靠它判断是否自动调用。',
    '2. 正文写清楚执行步骤、注意事项和示例，保持精炼；内容较多时拆到同目录的参考文件，在正文里说明何时读取。',
    '3. 需要脚本时放到同目录的 scripts/ 下，并在正文说明用法。',
    `4. 动手前先检查是否已有同名技能；完成后告诉我文件路径，以及可以用 /${name} 调用。`
  )
  const prompt = lines.join('\n')
  return draft.creator ? `/${draft.creator} ${prompt}` : prompt
}
