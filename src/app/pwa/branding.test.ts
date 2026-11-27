import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { brand } from '@/shared/lib/brand'

const manifestUrl = new URL('../../../public/manifest.webmanifest', import.meta.url)
const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'))
const html = readFileSync(new URL('../../../index.html', import.meta.url), 'utf8')

describe('Menos Líos install identity', () => {
  it('keeps the installed app identity and URL stable while changing only visible branding', () => {
    expect(manifest).toMatchObject({
      id: '/',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      name: brand.name,
      short_name: brand.name,
      description: brand.promise,
      lang: 'es',
    })
    expect(html).toContain(`<title>${brand.name} · un producto de ${brand.maker}</title>`)
    expect(html).toContain(`name="apple-mobile-web-app-title" content="${brand.name}"`)
    expect(html).toContain(`name="application-name" content="${brand.name}"`)
    expect(html).toContain(`name="theme-color" content="${manifest.theme_color}"`)
    expect(html).toContain(`href="${brand.mark}"`)
  })

  it('advertises new separate URLs for regular, maskable and Apple icons', () => {
    expect(manifest.icons).toEqual([
      { src: '/menoslios-pwa-icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/menoslios-pwa-icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/menoslios-pwa-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ])
    expect(html).toContain(
      'rel="apple-touch-icon" sizes="180x180" href="/menoslios-pwa-apple-180.png"',
    )
    expect(
      readFileSync(new URL(`../../../public${brand.mark}`, import.meta.url), 'utf8'),
    ).toContain(manifest.theme_color)
  })
})
