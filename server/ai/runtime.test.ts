import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { stripTypeScriptTypes } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { expect, it } from 'vitest'

it('loads the transpiled AI endpoint in Node without a bundler or application credentials', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const output = mkdtempSync(join(tmpdir(), 'abaco-ai-runtime-'))
  try {
    writeFileSync(join(output, 'package.json'), '{"type":"module"}')
    symlinkSync(join(root, 'node_modules'), join(output, 'node_modules'), 'junction')
    for (const source of [
      'api/ai_suggestion.ts',
      'server/ai/gemini.ts',
      'server/ai/http.ts',
      'server/visit-report-pdf/http.ts',
      'src/features/ai/domain/suggestions.ts',
      'src/shared/domain/form-limits.ts',
      'src/shared/domain/money.ts',
    ]) {
      const target = join(output, source.replace(/\.ts$/, '.js'))
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, stripTypeScriptTypes(readFileSync(join(root, source), 'utf8')))
    }
    expect(() =>
      execFileSync(
        process.execPath,
        [
          '--input-type=module',
          '-e',
          "const endpoint = await import('./api/ai_suggestion.js'); if (typeof endpoint.default !== 'function') process.exit(1)",
        ],
        { cwd: output, env: {}, stdio: 'pipe' },
      ),
    ).not.toThrow()
  } finally {
    rmSync(output, { recursive: true, force: true })
  }
})
