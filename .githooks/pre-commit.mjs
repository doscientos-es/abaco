import { spawnSync } from 'node:child_process'
import { lstatSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)

function run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  })
  if (result.error || result.status !== 0) {
    throw new Error(`${command} failed${result.error ? `: ${result.error.message}` : ''}`)
  }
  return result.stdout ?? ''
}

function git(...args) {
  return run('git', args, true)
}

function chunks(paths) {
  const batches = []
  let batch = []
  let length = 0
  for (const path of paths) {
    if (length + path.length > 6000 && batch.length) {
      batches.push(batch)
      batch = []
      length = 0
    }
    batch.push(path)
    length += path.length + 3
  }
  if (batch.length) batches.push(batch)
  return batches
}

try {
  const staged = git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z')
    .split('\0')
    .filter(Boolean)
  const unstaged = new Set(git('diff', '--name-only', '-z').split('\0').filter(Boolean))
  const modes = new Map(
    git('ls-files', '--stage', '-z')
      .split('\0')
      .filter(Boolean)
      .map((entry) => [entry.slice(entry.indexOf('\t') + 1), entry.slice(0, 6)]),
  )
  const files = staged.filter((path) => ['100644', '100755'].includes(modes.get(path)))

  const partial = files.filter((path) => unstaged.has(path))
  if (partial.length) {
    throw new Error(
      `Partially staged files cannot be fixed safely. Stage or separate changes first:\n${partial.join('\n')}`,
    )
  }
  for (const path of files) {
    if (['*', '?', '[', ']', '{', '}', '!'].some((character) => path.includes(character))) {
      throw new Error(`Cannot safely pass a glob-like filename to the formatter: ${path}`)
    }
    if (!lstatSync(path).isFile()) throw new Error(`Not a regular file: ${path}`)
  }

  if (files.length) {
    const binary = (name) => {
      const manifest = require.resolve(`${name}/package.json`)
      return join(dirname(manifest), require(manifest).bin[name])
    }
    for (const batch of chunks(files)) {
      const paths = batch.map((path) => `./${path}`)
      run(process.execPath, [
        binary('oxlint'),
        '--fix',
        '--no-error-on-unmatched-pattern',
        ...paths,
      ])
      run(process.execPath, [
        binary('oxfmt'),
        '-c',
        'node_modules/@doscientos/configs/oxfmt.json',
        '--write',
        '--no-error-on-unmatched-pattern',
        ...paths,
      ])
      run('git', ['--literal-pathspecs', 'add', '--force', '--', ...batch])
    }
  }
} catch (error) {
  process.stderr.write(
    `pre-commit: ${error instanceof Error ? error.message : 'automatic fixes failed'}\n`,
  )
  process.exitCode = 1
}
