import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'
import type { Plugin } from 'vite'

const root = fileURLToPath(new URL('../', import.meta.url))

/** Precache only build-owned static assets; API responses and private data never enter Cache Storage. */
export function pwaPlugin(): Plugin {
  return {
    name: 'abaco-pwa',
    apply: 'build',
    async buildStart() {
      const icon = await readFile(`${root}/public/abaco-mark.svg`)
      for (const size of [192, 512]) {
        const source = await sharp(icon).resize(size, size).png().toBuffer()
        this.emitFile({ type: 'asset', fileName: `pwa-icon-${size}.png`, source })
      }
      const mark = await sharp(icon).resize(384, 384).png().toBuffer()
      const maskable = await sharp({
        create: { width: 512, height: 512, channels: 4, background: '#2a4227' },
      })
        .composite([{ input: mark, gravity: 'centre' }])
        .png()
        .toBuffer()
      this.emitFile({ type: 'asset', fileName: 'pwa-maskable-512.png', source: maskable })
    },
    generateBundle: {
      order: 'post',
      async handler(_options, bundle) {
        const worker = await readFile(`${root}/src/pwa/service-worker.js`, 'utf8')
        const manifest = await readFile(`${root}/public/manifest.webmanifest`)
        const assets = Object.keys(bundle)
          .filter(
            (name) =>
              name === 'index.html' ||
              name.startsWith('assets/') ||
              name.startsWith('pwa-icon-') ||
              name === 'pwa-maskable-512.png',
          )
          .map((name) => `/${name}`)
        if (!assets.includes('/index.html')) this.error('PWA: falta index.html en el build.')
        assets.push('/manifest.webmanifest', '/abaco-mark.svg')
        assets.sort()
        const hash = createHash('sha256').update(worker).update(manifest)
        for (const asset of assets) {
          hash.update(asset)
          const file = bundle[asset.slice(1)]
          if (file?.type === 'chunk') hash.update(file.code)
          else if (file?.type === 'asset') hash.update(file.source)
        }
        const version = hash.digest('hex').slice(0, 16)
        this.emitFile({
          type: 'asset',
          fileName: 'sw.js',
          source: worker
            .replace('__PWA_VERSION__', version)
            .replace('__PWA_ASSETS__', JSON.stringify(assets)),
        })
      },
    },
  }
}
