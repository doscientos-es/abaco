import { availableParallelism } from 'node:os'
import { fileURLToPath, URL } from 'node:url'

import { createVitestConfig } from '@doscientos/configs/vitest'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // Tests must not load local application credentials.
  envDir: false,
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    ...createVitestConfig({
      include: [
        'src/**/*.test.{ts,tsx}',
        'server/**/*.test.{ts,tsx}',
        'scripts/**/*.test.mjs',
        'supabase/functions/_shared/**/*.test.ts',
      ],
      coverage: { include: ['src/features/**/application/**/*.ts'] },
    }),
    // Process isolation keeps module mocks and React hook instances scoped to each test file.
    pool: 'forks',
    maxWorkers: Math.min(4, availableParallelism()),
  },
})
