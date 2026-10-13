import { createVitestConfig } from '@doscientos/configs/vitest'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: createVitestConfig({
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: { include: ['src/features/**/application/**/*.ts'] },
  }),
})
