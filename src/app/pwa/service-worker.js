/* Build-time placeholders are replaced by the PWA Vite plugin. */
const CACHE_PREFIX = 'menoslios-shell-'
const LEGACY_CACHE_PREFIX = 'abaco-shell-'
const CACHE_NAME = `${CACHE_PREFIX}__PWA_VERSION__`
const ASSETS = __PWA_ASSETS__

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(async (keys) => {
      await Promise.all(
        keys
          .filter(
            (key) =>
              (key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME) ||
              key.startsWith(LEGACY_CACHE_PREFIX),
          )
          .map((key) => caches.delete(key)),
      )
      await self.clients.claim()
    }),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (['/solicitud', '/solicitud/', '/solicitud.html'].includes(url.pathname)) return
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api/')
  )
    return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () => {
        const cached = await (await caches.open(CACHE_NAME)).match('/index.html')
        if (!cached) throw new Error('La aplicación no está disponible sin conexión.')
        return cached
      }),
    )
  } else if (url.pathname === '/manifest.webmanifest') {
    // Browsers use the latest manifest to discover installed name/icon updates.
    event.respondWith(
      fetch(request, { cache: 'no-cache' }).catch(async () => {
        const cached = await (await caches.open(CACHE_NAME)).match(url.pathname)
        if (!cached)
          throw new Error('El manifiesto de la aplicación no está disponible sin conexión.')
        return cached
      }),
    )
  } else if (ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches
        .open(CACHE_NAME)
        .then(async (cache) => (await cache.match(url.pathname)) ?? fetch(request)),
    )
  }
})
