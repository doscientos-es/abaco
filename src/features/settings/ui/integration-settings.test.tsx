import type * as UI from '@doscientos/ui'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { query, search, dialog } = vi.hoisted(() => ({
  query: vi.fn(),
  search: vi.fn(),
  dialog: { open: false },
}))
vi.mock('@tanstack/react-query', () => ({
  useQuery: query,
  useQueryClient: vi.fn(),
  queryOptions: (value: unknown) => value,
}))
vi.mock('@tanstack/react-router', () => ({ useSearch: search }))
vi.mock('@/features/auth', () => ({ useSession: () => ({ tenantId: 'tenant-a' }) }))
vi.mock('@doscientos/ui', async (importOriginal) => {
  const ui = await importOriginal<typeof UI>()
  return {
    ...ui,
    // Render dialog content inline when open so it can be tested without a DOM/portal.
    DialogContent: ({ children }: React.ComponentProps<typeof ui.DialogContent>) =>
      dialog.open ? <dialog open>{children}</dialog> : null,
  }
})

import { GoogleCalendarPermissionError } from '../application/google-calendar-actions'
import { GoogleCalendarSettings } from './google-calendar-settings'
import { StripeConnectSettings } from './stripe-connect-settings'

beforeEach(() => {
  dialog.open = false
  search.mockReturnValue({})
})

describe('Stripe settings', () => {
  it('keeps the payments caveat and authorization action in the connection dialog', () => {
    query.mockReturnValue({ data: { connected: false, liveMode: false } })
    const render = () => renderToStaticMarkup(<StripeConnectSettings tenantId="tenant-a" />)
    const card = render()
    expect(card).toContain('aria-haspopup="dialog"')
    expect(card).toContain('Conectar: Stripe')
    expect(card).toContain('Modo de pruebas')
    expect(card).not.toContain('Cobros aún no disponibles')
    expect(card).not.toContain('Continuar con Stripe')

    dialog.open = true
    const details = render()
    expect(details).toContain('>Conectar Stripe</')
    expect(details.split('<dialog ')[1]).toContain('Sin conectar')
    expect(details.split('<dialog ')[1]).toContain('Modo de pruebas')
    expect(details).toContain('Conectar la cuenta no activa los cobros con Stripe en Menos Líos.')
    expect(details).toContain('Continuar con Stripe')
  })

  it('does not offer a second connection when the tenant is already linked', () => {
    dialog.open = true
    query.mockReturnValue({ data: { connected: true, liveMode: true } })
    const html = renderToStaticMarkup(<StripeConnectSettings tenantId="tenant-a" />)
    expect(html).toContain('Cuenta vinculada')
    expect(html.split('<dialog ')[1]).toContain('Cuenta vinculada')
    expect(html.split('<dialog ')[1]).toContain('Modo real')
    expect(html).toContain('no hay más opciones de configuración de Stripe')
    expect(html).toContain('Ver detalles: Stripe')
    expect(html).not.toContain('Continuar con Stripe')
    expect(html).not.toContain('Modo de pruebas')
  })

  it('offers a status retry rather than authorization when the account state is unknown', () => {
    dialog.open = true
    query.mockReturnValue({ isError: true })
    const html = renderToStaticMarkup(<StripeConnectSettings tenantId="tenant-a" />)
    expect(html).toContain('Estado no disponible')
    expect(html).toContain('Reintentar consulta')
    expect(html).not.toContain('Continuar con Stripe')
  })
})

describe('Google Calendar settings', () => {
  it('does not allow connecting while the current status cannot be checked', () => {
    dialog.open = true
    query.mockReturnValue({ isError: true })
    const html = renderToStaticMarkup(<GoogleCalendarSettings />)
    expect(html).toContain('No se pudo consultar el estado de Google Calendar.')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Continuar con Google<\/button>/)
  })

  it('explains when the server denies calendar access', () => {
    dialog.open = true
    query.mockReturnValue({ isError: true, error: new GoogleCalendarPermissionError() })
    const html = renderToStaticMarkup(<GoogleCalendarSettings />)
    expect(html).toContain('Tu cuenta no tiene permiso para usar Google Calendar en esta empresa.')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Continuar con Google<\/button>/)
  })

  it('puts data sharing, quotas and authorization in the reconnect dialog', () => {
    query.mockReturnValue({
      data: { status: 'reauthorize', lastError: 'reauthorize', accessActive: true },
    })
    const render = () => renderToStaticMarkup(<GoogleCalendarSettings />)
    const card = render()
    expect(card).toContain('Requiere acceso')
    expect(card).toContain('Volver a conectar: Google Calendar')
    expect(card).not.toContain('Qué se sincroniza')
    expect(card).not.toContain('Continuar con Google')

    dialog.open = true
    const details = render()
    expect(details.split('<dialog ')[1]).toContain('Requiere acceso')
    expect(details).toContain('Qué se sincroniza')
    expect(details).toContain('Los cambios en Google Calendar no modifican Menos Líos.')
    expect(details).toContain('Tu calendario y las cuotas')
    expect(details).toContain('Qué pasa al desconectar')
    expect(details).toContain('Continuar con Google')
  })

  it('keeps sync and disconnect actions in the connected account dialog', () => {
    query.mockReturnValue({ data: { status: 'connected', pendingJobs: 2, accessActive: true } })
    const render = () => renderToStaticMarkup(<GoogleCalendarSettings />)
    expect(render()).toContain('Gestionar: Google Calendar')
    expect(render()).not.toContain('Sincronizar ahora')

    dialog.open = true
    const details = render()
    expect(details.split('<dialog ')[1]).toContain('Conectado')
    expect(details).toContain('Sincronizar ahora')
    expect(details).toContain('>Desconectar</button>')
    expect(details).toMatch(/Sincronizando .*2.* visitas…/)
    expect(details).not.toContain('Continuar con Google')
  })

  it('pauses synchronization but permits disconnecting when company access expires', () => {
    dialog.open = true
    query.mockReturnValue({ data: { status: 'connected', pendingJobs: 2, accessActive: false } })
    const html = renderToStaticMarkup(<GoogleCalendarSettings />)
    expect(html).toContain('La sincronización está en pausa')
    expect(html).toContain('Sincronizaciones pendientes: 2.')
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Sincronizar ahora<\/button>/)
    expect(html).toContain('>Desconectar</button>')
    expect(html).not.toContain('Sincronizando')
  })

  it('explains when a connected calendar has no recorded or pending synchronization', () => {
    dialog.open = true
    query.mockReturnValue({
      data: { status: 'connected', pendingJobs: 0, lastSyncedAt: null, accessActive: true },
    })
    const html = renderToStaticMarkup(<GoogleCalendarSettings />)
    expect(html).toContain('Aún no hay ninguna sincronización registrada.')
    expect(html).toContain('No hay sincronizaciones pendientes.')
  })
})
