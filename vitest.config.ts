import { fileURLToPath, URL } from 'node:url'

import { createVitestConfig } from '@doscientos/configs/vitest'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: createVitestConfig({
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: { include: ['src/features/**/application/**/*.ts'] },
  }),
})
