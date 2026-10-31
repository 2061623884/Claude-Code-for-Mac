# File Drag Composer Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add file drag/drop, a native file picker, removable attachment cards, and a clickable plus-button burst animation to the shared chat Composer.

**Architecture:** Keep attachment drafts in page-level React state so they survive ApprovalCard swaps. Store canonical absolute paths, validate them through a narrow main-process IPC call, derive `@relative/path` references at submit time, and pass a composed prompt plus the original user text to the existing text-only Agent SDK flow.

**Tech Stack:** Electron 44, React 19, TypeScript, Zustand, Tailwind CSS 4, Vitest.

---

## Chunk 1: File model and Electron bridge

### Task 1: Shared attachment path helpers

**Files:**
- Create: `test/attachments.test.ts`
- Create: `src/shared/attachments.ts`
- Test: `test/attachments.test.ts`

- [x] **Step 1: Write failing path-composition tests**

```ts
import { describe, expect, it } from 'vitest'
import {
  attachmentTitle,
  buildPrompt,
  mergeAttachments,
  referenceFor,
  type ComposerAttachment
} from '../src/shared/attachments'

const file = (path: string): ComposerAttachment => ({
  path,
  name: path.slice(path.lastIndexOf('/') + 1),
  extension: 'ts',
  bytes: 10
})

describe('referenceFor', () => {
  it('uses a project-relative path for a child file', () => {
    expect(referenceFor('/work/project/src/a.ts', '/work/project')).toBe('@src/a.ts')
  })

  it('keeps absolute paths outside the project', () => {
    expect(referenceFor('/work/other/a.ts', '/work/project')).toBe('@/work/other/a.ts')
  })

  it('does not treat a sibling directory as a project child', () => {
    expect(referenceFor('/work/project-other/a.ts', '/work/project')).toBe('@/work/project-other/a.ts')
  })
})

describe('buildPrompt', () => {
  it('puts references before trimmed user text', () => {
    expect(buildPrompt('  explain this  ', [file('/work/project/src/a.ts')], '/work/project')).toBe(
      '@src/a.ts\n\nexplain this'
    )
  })

  it('separates multiple references with one newline', () => {
    expect(
      buildPrompt('compare', [file('/work/project/src/a.ts'), file('/work/project/src/b.ts')], '/work/project')
    ).toBe('@src/a.ts\n@src/b.ts\n\ncompare')
  })

  it('supports attachment-only prompts', () => {
    expect(buildPrompt('', [file('/work/project/src/a.ts')], '/work/project')).toBe('@src/a.ts')
  })

  it('returns trimmed text unchanged when there are no attachments', () => {
    expect(buildPrompt('  hello  ', [], '/work/project')).toBe('hello')
  })
})

describe('mergeAttachments', () => {
  it('deduplicates by canonical path and keeps insertion order', () => {
    expect(mergeAttachments([file('/a.ts')], [file('/a.ts'), file('/b.ts')]).map((f) => f.path)).toEqual([
      '/a.ts',
      '/b.ts'
    ])
  })
})

describe('attachmentTitle', () => {
  it('uses text before attachment names', () => {
    expect(attachmentTitle('fix it', [file('/a.ts')])).toBe('fix it')
  })

  it('falls back to names for attachment-only drafts', () => {
    expect(attachmentTitle('', [file('/a.ts'), file('/b.ts')])).toBe('a.ts、b.ts')
  })
})
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm test -- test/attachments.test.ts`

Expected: FAIL because `src/shared/attachments.ts` does not exist.

- [x] **Step 3: Implement the minimal shared module**

```ts
export interface ComposerAttachment {
  path: string
  name: string
  extension: string
  bytes: number
}

export interface ComposerSubmission {
  text: string
  prompt: string
  attachments: ComposerAttachment[]
}

export function normalizeAbsolutePath(path: string): string {
  const slashed = path.replace(/\\/g, '/')
  if (slashed === '/') return '/'
  return slashed.replace(/\/+$/, '')
}

export function referenceFor(path: string, cwd?: string): string {
  const target = normalizeAbsolutePath(path)
  const root = cwd ? normalizeAbsolutePath(cwd) : ''
  const relative = root && target.startsWith(root + '/') ? target.slice(root.length + 1) : target
  return '@' + relative
}

export function buildPrompt(text: string, attachments: ComposerAttachment[], cwd?: string): string {
  const body = text.trim()
  const references = attachments.map((file) => referenceFor(file.path, cwd))
  if (references.length === 0) return body
  if (body === '') return references.join('\n')
  return `${references.join('\n')}\n\n${body}`
}

export function mergeAttachments(
  current: ComposerAttachment[],
  incoming: ComposerAttachment[]
): ComposerAttachment[] {
  const seen = new Set(current.map((file) => file.path))
  return [...current, ...incoming.filter((file) => !seen.has(file.path) && Boolean(seen.add(file.path)))]
}

export function attachmentTitle(text: string, attachments: ComposerAttachment[]): string {
  return text.trim() || attachments.map((file) => file.name).join('、') || '新会话'
}
```

- [x] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- test/attachments.test.ts`

Expected: 9 tests pass.

- [x] **Step 5: Commit**

Skip: workspace has no `.git` directory.

### Task 2: Main-process file validation and preload bridge

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/files.ts`
- Modify: `src/main/ipc.ts`
- Modify: `src/preload/index.ts`
- Test: `test/files.test.ts`

- [x] **Step 1: Add a failing regular-file descriptor test**

```ts
import { chmod, mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { describePaths } from '../src/main/files'

it('returns regular files and ignores directories', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-desk-files-'))
  const file = join(root, 'notes.md')
  const dir = join(root, 'folder')
  await writeFile(file, 'hello')
  await mkdir(dir)
  expect(await describePaths([file, dir, join(root, 'missing.md')])).toEqual([
    { path: file, name: 'notes.md', extension: 'md', bytes: 5 }
  ])
})

it('ignores a file whose contents cannot be read', async () => {
  const root = await mkdtemp(join(tmpdir(), 'claude-desk-files-'))
  const file = join(root, 'private.txt')
  await writeFile(file, 'secret')
  await chmod(file, 0o000)
  try {
    expect(await describePaths([file])).toEqual([])
  } finally {
    await chmod(file, 0o600)
  }
})
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm test -- test/files.test.ts`

Expected: FAIL because `describePaths` is not exported.

- [x] **Step 3: Add `FileInfo`, `files.pathFor`, `files.describe`, and IPC**

`DeskApi.files` gains:

```ts
pathFor(file: File): string
describe(paths: string[]): Promise<FileInfo[]>
```

`src/main/files.ts` exports:

```ts
export async function describePaths(paths: string[]): Promise<FileInfo[]> {
  const unique = [...new Set(paths.map((path) => resolve(path)))]
  const results = await Promise.all(
    unique.map(async (path) => {
      const info = await stat(path).catch(() => null)
      if (!info?.isFile()) return null
      const readable = await access(path, constants.R_OK).then(
        () => true,
        () => false
      )
      if (!readable) return null
      return {
        path,
        name: basename(path),
        extension: extname(path).slice(1).toLowerCase(),
        bytes: info.size
      }
    })
  )
  return results.filter((file): file is FileInfo => file !== null)
}
```

`ipc.ts` registers `files:describe`, validating that the argument is an array of nonempty strings.

`preload/index.ts` imports `webUtils` and exposes:

```ts
files: {
  pathFor: (file) => webUtils.getPathForFile(file),
  describe: call('files:describe'),
  search: call('files:search')
}
```

- [x] **Step 4: Run focused tests and typecheck**

Run: `npm test -- test/attachments.test.ts test/files.test.ts && npm run typecheck`

Expected: all focused tests pass and both TypeScript projects typecheck.

- [x] **Step 5: Commit**

Skip: workspace has no `.git` directory.

## Chunk 2: Composer interaction and callers

### Task 3: Shared Composer attachment UI

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tsconfig.node.json`
- Modify: `tsconfig.web.json`
- Create: `tsconfig.test-web.json`
- Create: `vitest.config.ts`
- Modify: `src/renderer/components/newSession/Composer.tsx`
- Modify: `src/renderer/styles/theme.css`
- Create: `test/composer.test.tsx`

- [x] **Step 1: Add component-test tooling**

Run: `npm install --save-dev @testing-library/react jsdom`

Expected: both packages are added to `devDependencies`, with React 19-compatible versions.

- [x] **Step 2: Add Vitest alias and web test typechecking**

Create `vitest.config.ts` with the same `@shared` alias as the renderer build:

```ts
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: { alias: { '@shared': resolve('src/shared') } },
  plugins: [react()]
})
```

Create `tsconfig.test-web.json` extending `tsconfig.web.json`, including renderer env declarations plus `test/composer.test.tsx`, and adding `types: ["vitest/globals", "node"]`. Exclude `test/**/*.tsx` from `tsconfig.node.json`. Add the new test typecheck to the package script:

```json
"typecheck": "tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json && tsc --noEmit -p tsconfig.test-web.json"
```

Run: `npm run typecheck`

Expected: PASS before component behavior changes, proving the test harness itself resolves renderer imports and JSX.

- [x] **Step 3: Write failing submission lifecycle tests**

Create `test/composer.test.tsx` with a small stateful harness around Composer:

- attachment-only input calls `onSubmit` with `{ text: '', prompt: '@src/a.ts', attachments }`;
- a resolved callback clears the text and attachment rail;
- a rejected callback keeps both text and attachment rail;
- `ready={false}` prevents submission even when an attachment exists.

Use `// @vitest-environment jsdom` at the top, `render`, `fireEvent`, and `waitFor`.

Run: `npm test -- test/composer.test.tsx`

Expected: FAIL because Composer still uses the old `canSubmit`/`onSubmit()` contract and has no attachment rail.

- [x] **Step 4: Replace the submit contract**

Use controlled props:

```ts
attachments: ComposerAttachment[]
onAttachmentsChange(next: ComposerAttachment[]): void
onSubmit(submission: ComposerSubmission): Promise<void> | void
ready: boolean
disabled?: boolean
```

Composer computes `canSend = ready && Boolean(value.trim() || attachments.length)`, awaits `onSubmit`, and calls `onChange('')` plus `onAttachmentsChange([])` only after success.

- [x] **Step 5: Add picker, drop intake, and validation**

- Add a hidden multiple file input triggered by a 28px circular plus button.
- On pick/drop, call `window.desk.files.pathFor(file)` and batch the paths through `window.desk.files.describe`.
- Filter directories through `DataTransferItem.webkitGetAsEntry()` before validation and rely on main-process `stat` as the authoritative check.
- Merge validated `FileInfo[]` into `ComposerAttachment[]` by absolute path.
- Register document-level file-drag listeners only while the composer is mounted; ignore drags without files.

- [x] **Step 6: Add attachment rail and drop feedback**

- Render a horizontal rail above the textarea with file-extension glyph, filename, size/path, and remove control.
- Show a dashed accent overlay on the composer while a file drag is active.
- Keep overflow horizontal and scrollbar-hidden so many files do not grow the composer.
- Use hover/focus-visible remove controls and visible controls for coarse pointers.

- [x] **Step 7: Add plus-button motion**

- On hover/focus, rotate the plus 90 degrees and scale the button to 1.04.
- On click or successful file addition, render a one-shot accent ring pulse.
- Add a small count badge when attachments exist.
- Disable the motion under `prefers-reduced-motion: reduce`.

- [x] **Step 8: Run the focused component test and verify GREEN**

Run: `npm test -- test/composer.test.tsx`

Expected: all Composer lifecycle tests pass.

- [x] **Step 9: Run typecheck as an expected RED integration checkpoint**

Run: `npm run typecheck`

Expected: FAIL only at NewSessionPage and ChatView due to the intentionally changed prop contract. This confirms Task 4 must update every caller before a green typecheck.

- [x] **Step 10: Commit**

Skip: workspace has no `.git` directory.

### Task 4: Wire new and existing sessions

**Files:**
- Modify: `src/renderer/components/newSession/NewSessionPage.tsx`
- Modify: `src/renderer/components/chat/ChatView.tsx`
- Modify: `src/renderer/chatStore.ts`
- Modify: `src/renderer/store.ts`

- [x] **Step 1: Hoist attachment drafts into both pages**

Initialize `const [attachments, setAttachments] = useState<ComposerAttachment[]>([])` in `NewSessionPage` and `ChatView`. This keeps drafts when ChatView swaps Composer for ApprovalCard and when project chips change `cwd`.

- [x] **Step 2: Keep Composer mounted during approval**

Change ChatView's approval branch to render the ApprovalCard first in the same bottom stack, then always render Composer below it. Pass `ready={chat.loaded && !approval}` so drafts and file controls remain mounted while sending is disabled until approval is resolved.

- [x] **Step 3: Preserve the user body for new-session titles**

Change `start` to accept an optional title:

```ts
start(text: string, title?: string): Promise<void>
```

Inside `start`, call:

```ts
addPendingSession(projectId, sessionId, title?.trim() || text)
```

NewSessionPage passes `attachmentTitle(submission.text, submission.attachments)` as that title while sending `submission.prompt` to Claude.

- [x] **Step 4: Make errors preserve drafts**

- NewSessionPage sends `submission.prompt`, sets `sending`, catches and displays the error, and rethrows so Composer does not clear.
- ChatView awaits `send`, catches failure into local `sendError`, and rethrows so Composer does not clear.
- Do not restore the old approval-card replacement path. The Composer remains mounted below the approval card as defined in Step 2.

- [x] **Step 5: Support attachment-only submit**

Pass `ready={Boolean(project && !sending)}` and `ready={chat.loaded && !approval}` rather than deriving readiness from text. Composer handles the final content check.

- [x] **Step 6: Run typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [x] **Step 7: Commit**

Skip: workspace has no `.git` directory.

## Chunk 3: Verification and visual QA

### Task 5: Automated and manual verification

**Files:**
- Verify: `src/shared/attachments.ts`
- Verify: `src/renderer/components/newSession/Composer.tsx`
- Verify: `src/renderer/components/chat/ChatView.tsx`
- Verify: `src/renderer/components/newSession/NewSessionPage.tsx`

- [x] **Step 1: Run the full automated suite**

Run: `npm test && npm run typecheck && npm run build`

Expected: all tests pass, both TS projects pass, Electron Vite build completes.

- [x] **Step 2: Launch the app**

Run: `npm run dev`

Expected: Electron window opens on the new-session screen without console errors.

- [x] **Step 3: Exercise the feature**

- Click plus and select multiple regular files.
- Drag files over the page and release inside Composer.
- Confirm directories, duplicate files, and empty paths produce no attachment.
- Remove one attachment; submit with text and with attachments only.
- Confirm successful submit clears the rail and failed submit preserves it.
- Open an existing chat, add an attachment, trigger an approval state, and confirm the attachment stays visible while the send button remains disabled; after resolving approval, sending clears the attachment.
- Switch projects after attaching and confirm submission derives the new relative path.

- [x] **Step 4: Check both themes and reduced motion**

- Inspect light and dark themes for text overflow, focus visibility, and rail clipping.
- Enable reduced motion and confirm the plus button has no rotation, scale, or burst animation.

- [x] **Step 5: Commit**

Skip: workspace has no `.git` directory.
