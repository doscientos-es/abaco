import { pathToFileURL } from 'node:url'

const numericVersion = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/

/** Preserve versions chosen in the PR; only bump on an ordinary push of the same version. */
export function releaseShouldBumpPatch(previous, current) {
  if (!numericVersion.test(current) || (previous && !numericVersion.test(previous))) {
    throw new Error('The release workflow requires a numeric major.minor.patch version.')
  }
  return previous === current
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [, , previous, current] = process.argv
  if (previous === undefined || current === undefined)
    throw new Error('Pass the previous and current package versions.')
  process.stdout.write(`bump_patch=${releaseShouldBumpPatch(previous, current)}\n`)
}
