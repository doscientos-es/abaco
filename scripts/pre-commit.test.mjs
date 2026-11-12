import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const root = process.cwd()
const repositories = []

function command(cwd, executable, args) {
  const result = spawnSync(executable, args, {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${join(cwd, 'bin')}${delimiter}${process.env.PATH}` },
  })
  if (result.error) throw result.error
  return result
}

function git(cwd, ...args) {
  const result = command(cwd, 'git', args)
  if (result.status !== 0) throw new Error(result.stderr)
  return result.stdout
}

function repository() {
  const cwd = mkdtempSync(join(tmpdir(), 'abaco-pre-commit-'))
  repositories.push(cwd)
  mkdirSync(join(cwd, '.githooks'))
  mkdirSync(join(cwd, 'bin'))
  writeFileSync(
    join(cwd, 'bin', 'pnpm'),
    '#!/bin/sh\n[ "$1" = "quality:quick" ] || exit 1\ntouch quality-quick-called\n',
  )
  chmodSync(join(cwd, 'bin', 'pnpm'), 0o755)
  for (const file of ['pre-commit', 'pre-commit.mjs']) {
    copyFileSync(join(root, '.githooks', file), join(cwd, '.githooks', file))
  }
  symlinkSync(resolve(root, 'node_modules'), join(cwd, 'node_modules'), 'junction')
  writeFileSync(
    join(cwd, 'package.json'),
    JSON.stringify({ scripts: { 'quality:quick': 'node -e "process.exit(0)"' } }),
  )
  writeFileSync(
    join(cwd, '.oxlintrc.json'),
    JSON.stringify({ rules: { 'no-useless-escape': 'error' } }),
  )
  writeFileSync(join(cwd, 'source.js'), 'console.log("original")\n')
  writeFileSync(join(cwd, 'unrelated.js'), 'console.log("original")\n')
  git(cwd, 'init', '-q')
  git(cwd, 'config', 'user.name', 'Hook Test')
  git(cwd, 'config', 'user.email', 'hook-test@example.invalid')
  git(cwd, 'add', 'source.js', 'unrelated.js')
  git(cwd, '-c', 'core.hooksPath=.git/hooks', 'commit', '-qm', 'baseline')
  git(cwd, 'config', 'core.hooksPath', '.githooks')
  return cwd
}

afterEach(() => {
  for (const cwd of repositories.splice(0)) rmSync(cwd, { recursive: true, force: true })
})

describe('pre-commit automatic fixes', () => {
  it('fixes and commits staged files without staging unrelated changes', () => {
    const cwd = repository()
    writeFileSync(join(cwd, 'source.js'), 'const value="\\#"; console.log(value);\n')
    writeFileSync(join(cwd, 'unrelated.js'), 'const unchanged   =  1;\n')
    git(cwd, 'add', 'source.js')

    const result = command(cwd, 'git', ['commit', '-m', 'fix'])
    expect(result.status, result.stderr + result.stdout).toBe(0)
    expect(readFileSync(join(cwd, 'quality-quick-called'), 'utf8')).toBe('')
    const committed = git(cwd, 'show', 'HEAD:source.js')
    expect(committed).toContain("const value = '#'")
    expect(readFileSync(join(cwd, 'source.js'), 'utf8')).toBe(committed)
    expect(readFileSync(join(cwd, 'unrelated.js'), 'utf8')).toBe('const unchanged   =  1;\n')
    expect(git(cwd, 'diff', '--name-only').trim()).toBe('unrelated.js')
  }, 30000)

  it('rejects partial staging without changing the index or working file', () => {
    const cwd = repository()
    writeFileSync(join(cwd, 'source.js'), 'const staged=1;\n')
    git(cwd, 'add', 'source.js')
    writeFileSync(join(cwd, 'source.js'), 'const staged=1;\nconst unstaged=2;\n')
    const before = git(cwd, 'show', ':source.js')

    const result = command(cwd, 'git', ['commit', '-m', 'partial'])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('Partially staged files')
    expect(git(cwd, 'show', ':source.js')).toBe(before)
    expect(readFileSync(join(cwd, 'source.js'), 'utf8')).toBe(
      'const staged=1;\nconst unstaged=2;\n',
    )
  }, 30000)

  it('refuses glob-like filenames rather than modifying other files', () => {
    const cwd = repository()
    writeFileSync(join(cwd, '[item].js'), 'const value=1;\n')
    git(cwd, 'add', '--', '[item].js')

    const result = command(cwd, 'git', ['commit', '-m', 'glob'])
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('glob-like filename')
    expect(readFileSync(join(cwd, '[item].js'), 'utf8')).toBe('const value=1;\n')
  }, 30000)
})
