// Shared recipe: keep copies in consuming repositories reviewed and versioned.
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = realpathSync(resolve(import.meta.dirname, '..'))
const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' })

try {
  const repository = git('rev-parse', '--show-toplevel')
  if (repository.status !== 0 || realpathSync(repository.stdout.trim()) !== root) {
    throw new Error(
      'Run hooks:install only in an initialized repository root, not a nested package.',
    )
  }
  const { scripts = {} } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  if (!scripts['quality:quick']) throw new Error('Define quality:quick before installing hooks.')

  const current = git('config', '--get', 'core.hooksPath')
  if (current.status !== 0 && current.status !== 1)
    throw new Error('Cannot inspect Git hooks config.')
  if (current.status === 0 && current.stdout.trim() !== '.githooks') {
    throw new Error('Existing core.hooksPath preserved. Review and integrate its hooks manually.')
  }
  if (current.status === 1) {
    const location = git('rev-parse', '--git-path', 'hooks')
    if (location.status !== 0) throw new Error('Cannot locate existing Git hooks.')
    const directory = resolve(root, location.stdout.trim())
    if (existsSync(directory) && readdirSync(directory).some((name) => !name.endsWith('.sample'))) {
      throw new Error('Existing Git hooks preserved. Review and integrate them manually.')
    }
  }

  chmodSync(join(root, '.githooks', 'pre-commit'), 0o755)
  if (git('config', '--local', 'core.hooksPath', '.githooks').status !== 0) {
    throw new Error('Cannot configure local Git hooks.')
  }
  process.stdout.write(
    'Pre-commit installed: pnpm quality:quick. No pre-push hook or automatic fixes.\n',
  )
} catch (error) {
  process.stderr.write(
    error instanceof Error ? `${error.message}\n` : 'Hook installation failed.\n',
  )
  process.exitCode = 1
}
