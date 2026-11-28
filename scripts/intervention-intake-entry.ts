import { fileURLToPath, URL } from 'node:url'

import type { Plugin } from 'vite'

// Add our isolated public page without replacing other product entry points.
export function interventionIntakeEntry(): Plugin {
  return {
    name: 'menoslios-intervention-intake-entry',
    config(config) {
      const current = config.build?.rolldownOptions?.input ?? config.build?.rollupOptions?.input
      const app = fileURLToPath(new URL('../index.html', import.meta.url))
      const intake = fileURLToPath(new URL('../solicitud.html', import.meta.url))
      if (typeof current === 'string' || Array.isArray(current)) {
        const input = Array.isArray(current) ? [...current, intake] : [current, intake]
        return { build: { rolldownOptions: { input } } }
      }
      return {
        build: {
          rolldownOptions: {
            input: { ...(current ?? { app }), interventionRequest: intake },
          },
        },
      }
    },
  }
}
