import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { interventionIntakeEntry } from './scripts/intervention-intake-entry'
import { pwaPlugin } from './scripts/pwa-plugin'

export default defineConfig({
  plugins: [
    interventionIntakeEntry(),
    TanStackRouterVite({ autoCodeSplitting: true, routeFileIgnorePattern: '\\.test\\.[jt]sx?$' }),
    react(),
    tailwindcss(),
    pwaPlugin(),
  ],
  build: {
    rolldownOptions: {
      input: {
        app: fileURLToPath(new URL('./index.html', import.meta.url)),
        customerPortal: fileURLToPath(new URL('./portal-cliente.html', import.meta.url)),
      },
    },
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
