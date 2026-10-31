import { describe, expect, it } from 'vitest'
import { fileName, findBarePaths, looksLikePath, parsePathRef, relativePath, resolvePath } from '../src/shared/fileLinks'

describe('parsePathRef', () => {
  it('识别各种写法的路径和行号', () => {
    expect(parsePathRef('/Users/a/研二作业批改/README.md')).toEqual({ path: '/Users/a/研二作业批改/README.md' })
    expect(parsePathRef('src/main/ipc.ts:42')).toEqual({ path: 'src/main/ipc.ts', line: 42 })
    expect(parsePathRef('src/main/ipc.ts:42:7')).toEqual({ path: 'src/main/ipc.ts', line: 42 })
    expect(parsePathRef('src/a.ts#L10-L20')).toEqual({ path: 'src/a.ts', line: 10 })
    expect(parsePathRef('file:///Users/a/My%20Doc.md')).toEqual({ path: '/Users/a/My Doc.md' })
    expect(parsePathRef('README.md')).toEqual({ path: 'README.md' })
    expect(parsePathRef('~/notes/todo.txt')).toEqual({ path: '~/notes/todo.txt' })
  })

  it('网址、普通代码和文字不当作路径', () => {
    for (const s of ['https://example.com/a.md', 'mailto:a@b.c', 'npm install', 'a + b', 'foo()', 'x.y.z()', '1.5', '...', 'and/or 选择', ''])
      expect(parsePathRef(s), s).toBeNull()
  })
})

describe('looksLikePath', () => {
  it('相对路径要像目录结构，单个文件名要带扩展名', () => {
    expect(looksLikePath('src/renderer/App.tsx')).toBe(true)
    expect(looksLikePath('./build.sh')).toBe(true)
    expect(looksLikePath('package.json')).toBe(true)
    expect(looksLikePath('成绩单.xlsx')).toBe(true)
    expect(looksLikePath('2026/10')).toBe(false)
    expect(looksLikePath('useState')).toBe(false)
  })
})

describe('findBarePaths', () => {
  it('找出正文里的绝对路径和 @ 引用，去掉末尾标点', () => {
    const text = '已更新 /Users/a/b/README.md，另见 ~/x/y.txt。引用 @src/main/ipc.ts:12 和 @小明'
    const found = findBarePaths(text).map((m) => [text.slice(m.start, m.end), m.ref])
    expect(found).toEqual([
      ['/Users/a/b/README.md', { path: '/Users/a/b/README.md' }],
      ['~/x/y.txt', { path: '~/x/y.txt' }],
      ['@src/main/ipc.ts:12', { path: 'src/main/ipc.ts', line: 12 }]
    ])
  })

  it('网址里的路径、日期、单独的斜杠不算', () => {
    expect(findBarePaths('看 https://a.com/b/c.md 和 2026/10/31，还有 / 号')).toEqual([])
  })
})

describe('resolvePath / fileName', () => {
  it('解析 ~、相对路径、. 和 ..', () => {
    expect(resolvePath('~/a.txt', '/p', '/Users/me')).toBe('/Users/me/a.txt')
    expect(resolvePath('src/../README.md', '/p/proj')).toBe('/p/proj/README.md')
    expect(resolvePath('./a/b.ts', '/p/')).toBe('/p/a/b.ts')
    expect(resolvePath('rel.md')).toBeNull()
    expect(fileName('/a/b/README.md')).toBe('README.md')
    expect(fileName('C:\\Users\\x\\作业\\README.md')).toBe('README.md')
    expect(fileName('/a/dir/')).toBe('dir')
  })
})

describe('relativePath', () => {
  it('项目内的文件去掉项目路径，项目外的保持原样', () => {
    expect(relativePath('/p/proj/src/a.ts', '/p/proj')).toBe('src/a.ts')
    expect(relativePath('/p/proj/src/a.ts', '/p/proj/')).toBe('src/a.ts')
    expect(relativePath('/p/project2/a.ts', '/p/proj')).toBe('/p/project2/a.ts')
    expect(relativePath('/x/a.ts')).toBe('/x/a.ts')
  })
})
