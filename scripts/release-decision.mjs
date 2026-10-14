import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// Keep the same versioning rule as doscientos-es/actions/npm-auto-release.
const semver =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/

export function decideRelease(previousVersion, currentVersion) {
  if (!semver.test(currentVersion)) {
    throw new Error(`package.json version is not valid SemVer: ${currentVersion}`)
  }

  return { bumpPatch: previousVersion !== '' && previousVersion === currentVersion }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [previousVersion = '', currentVersion = ''] = process.argv.slice(2)
  const { bumpPatch } = decideRelease(previousVersion, currentVersion)
  console.log(`bump_patch=${bumpPatch}`)
}
