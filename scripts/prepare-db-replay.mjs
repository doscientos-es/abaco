import { randomBytes } from 'node:crypto'
import {
  copyFileSync,
  cpSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  writeFileSync,
} from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const adminMigration = '20261110130000_admin_absence_management.sql'
const absenceTypes = '20261110180807_absence_request_types.sql'
const prerequisite = '20261110180842_absence_information_followup.sql'

// The remote records these versions out of dependency order. Only disposable
// databases may use these synthetic filenames; the SQL and real history stay intact.
export function buildReplayPlan(files) {
  const sorted = [...files].sort((a, b) => a.localeCompare(b))
  if (sorted.some((file) => !/^[0-9]{14}_[a-z0-9_]+\.sql$/.test(file))) {
    throw new Error('Invalid migration filename')
  }
  const versions = sorted.map((file) => file.slice(0, 14))
  if (new Set(versions).size !== versions.length) throw new Error('Duplicate migration version')
  const adminIndex = sorted.indexOf(adminMigration)
  const typesIndex = sorted.indexOf(absenceTypes)
  const prerequisiteIndex = sorted.indexOf(prerequisite)
  if (adminIndex < 0 || typesIndex < 0 || prerequisiteIndex < 0)
    throw new Error('Replay dependency is missing')
  if (adminIndex >= prerequisiteIndex || typesIndex >= prerequisiteIndex)
    throw new Error('Replay dependency order changed; review the plan')

  const ordered = [...sorted]
  ordered.splice(adminIndex, 1)
  ordered.splice(ordered.indexOf(prerequisite) + 1, 0, adminMigration)
  return ordered.map((source, index) => ({ source, target: versions[index] + source.slice(14) }))
}

export function prepareReplay(workdir) {
  if (!workdir || !isAbsolute(workdir)) throw new Error('Provide an absolute temporary directory')
  const absolute = resolve(workdir)
  const destination = join(realpathSync(dirname(absolute)), basename(absolute))
  const fromProject = relative(projectRoot, destination)
  const toProject = relative(destination, projectRoot)
  const isWithin = (path) =>
    !path || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path))
  if (isWithin(fromProject) || isWithin(toProject)) {
    throw new Error('Replay directory must be outside the repository')
  }
  const source = join(projectRoot, 'supabase')
  const config = readFileSync(join(source, 'config.toml'), 'utf8')
  if (!/^project_id = "propuestas"$/m.test(config))
    throw new Error('Unexpected Supabase project ID')
  const plan = buildReplayPlan(
    readdirSync(join(source, 'migrations')).filter((file) => file.endsWith('.sql')),
  )
  mkdirSync(destination) // Refuse to overwrite an existing directory.
  const target = join(destination, 'supabase')
  mkdirSync(target)
  mkdirSync(join(target, 'migrations'))
  const replayId = `abaco-replay-${randomBytes(4).toString('hex')}`
  writeFileSync(
    join(target, 'config.toml'),
    config.replace(/^project_id = "propuestas"$/m, `project_id = "${replayId}"`),
  )
  cpSync(join(source, 'tests'), join(target, 'tests'), { recursive: true })
  for (const entry of plan)
    copyFileSync(join(source, 'migrations', entry.source), join(target, 'migrations', entry.target))
  return plan.length
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const count = prepareReplay(process.argv[2])
  process.stdout.write(
    `Prepared ${count} migrations in an isolated, disposable Supabase project.\n`,
  )
}
