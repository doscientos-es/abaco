import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'

import { describe, expect, it, vi } from 'vitest'

function worker() {
  const handlers = new Map<string, (event: unknown) => void>()
  const cache = {
    addAll: vi.fn(async () => {}),
    match: vi.fn(async (path: string) =>
      new Map([
        ['/index.html', 'shell'],
        ['/assets/app.js', 'script'],
        ['/manifest.webmanifest', 'manifest'],
      ]).get(path),
    ),
  }
  const caches = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => [
      'abaco-shell-old',
      'menoslios-shell-old',
      'menoslios-shell-test',
      'other-app',
    ]),
    delete: vi.fn(async () => true),
  }
  const fetch = vi.fn(async () => 'network')
  const claim = vi.fn(async () => {})
  const self = {
    location: { origin: 'https://abaco.test' },
    clients: { claim },
    addEventListener: (type: string, handler: (event: unknown) => void) =>
      handlers.set(type, handler),
  }
  const source = readFileSync(new URL('./service-worker.js', import.meta.url), 'utf8')
    .replace('__PWA_VERSION__', 'test')
    .replace('__PWA_ASSETS__', JSON.stringify(['/index.html', '/assets/app.js']))
  runInNewContext(source, { self, caches, fetch, URL })
  return { handlers, cache, caches, fetch, claim }
}

describe('PWA service worker', () => {
  it('precaches the shell and removes old and legacy caches on activation', async () => {
    const { handlers, cache, caches, claim } = worker()
    const install = vi.fn()
    handlers.get('install')?.({ waitUntil: install })
    await install.mock.calls[0]?.[0]
    expect(cache.addAll).toHaveBeenCalledWith(['/index.html', '/assets/app.js'])
    const activate = vi.fn()
    handlers.get('activate')?.({ waitUntil: activate })
    await activate.mock.calls[0]?.[0]
    expect(caches.delete).toHaveBeenCalledTimes(2)
    expect(caches.delete).toHaveBeenCalledWith('abaco-shell-old')
    expect(caches.delete).toHaveBeenCalledWith('menoslios-shell-old')
    expect(claim).toHaveBeenCalledOnce()
  })

  it('uses the shell offline for navigation and serves precached scripts', async () => {
    const { handlers, fetch } = worker()
    fetch.mockRejectedValueOnce(new Error('offline'))
    const respondWith = vi.fn()
    handlers.get('fetch')?.({
      request: {
        method: 'GET',
        mode: 'navigate',
        url: 'https://abaco.test/clientes/123?private=1',
      },
      respondWith,
    })
    await expect(respondWith.mock.calls[0]?.[0]).resolves.toBe('shell')
    respondWith.mockClear()
    handlers.get('fetch')?.({
      request: { method: 'GET', mode: 'cors', url: 'https://abaco.test/assets/app.js' },
      respondWith,
    })
    await expect(respondWith.mock.calls[0]?.[0]).resolves.toBe('script')
  })

  it('revalidates the install manifest online and falls back to the built manifest offline', async () => {
    const { handlers, fetch } = worker()
    const request = { method: 'GET', mode: 'cors', url: 'https://abaco.test/manifest.webmanifest' }
    const respondWith = vi.fn()
    handlers.get('fetch')?.({ request, respondWith })
    await expect(respondWith.mock.calls[0]?.[0]).resolves.toBe('network')
    expect(fetch).toHaveBeenCalledWith(request, { cache: 'no-cache' })

    fetch.mockRejectedValueOnce(new Error('offline'))
    respondWith.mockClear()
    handlers.get('fetch')?.({ request, respondWith })
    await expect(respondWith.mock.calls[0]?.[0]).resolves.toBe('manifest')
  })

  it('never intercepts APIs, cross-origin requests, writes or unlisted assets', () => {
    const { handlers } = worker()
    const respondWith = vi.fn()
    for (const request of [
      { method: 'GET', mode: 'navigate', url: 'https://abaco.test/api/report' },
      { method: 'GET', mode: 'cors', url: 'https://supabase.test/rest/v1/clients' },
      { method: 'POST', mode: 'cors', url: 'https://abaco.test/assets/app.js' },
      { method: 'GET', mode: 'cors', url: 'https://abaco.test/private/document.pdf' },
    ])
      handlers.get('fetch')?.({ request, respondWith })
    expect(respondWith).not.toHaveBeenCalled()
  })
})
