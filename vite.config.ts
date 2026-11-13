import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import { pwaPlugin } from './scripts/pwa-plugin'

export default defineConfig({
  plugins: [
    TanStackRouterVite({ autoCodeSplitting: true, routeFileIgnorePattern: '\\.test\\.[jt]sx?$' }),
    react(),
    tailwindcss(),
    pwaPlugin(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
