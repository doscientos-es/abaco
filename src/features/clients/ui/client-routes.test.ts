import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory, createRouter } from '@tanstack/react-router'
import { describe, expect, it } from 'vitest'

import { routeTree } from '@/routeTree.gen'

describe('client navigation', () => {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory(),
    context: { queryClient: new QueryClient() },
  })

  it.each([
    ['/clientes', '/clientes/'],
    ['/clientes/nuevo', '/clientes/nuevo'],
    ['/clientes/client-1', '/clientes/$clientId'],
    ['/clientes/client-1/editar', '/clientes/$clientId_/editar'],
  ])('matches %s to the intended screen', (path, routeId) => {
    const matches = router.matchRoutes(path)
    expect(matches.at(-1)?.routeId).toBe(routeId)
    if (path.endsWith('/editar')) {
      expect(matches.map((match) => match.routeId)).not.toContain('/clientes/$clientId')
    }
  })
})
