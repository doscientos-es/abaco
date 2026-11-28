import type * as UI from '@doscientos/ui'
import type { ComponentProps, ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { can } from '@/features/auth/domain/permissions'
import type { Estimate } from '@/shared/domain/types'

const state = vi.hoisted(() => ({
  status: 'draft',
  role: 'admin',
  automaticContract: false,
  purpose: 'contract' as 'work' | 'contract',
  documentFormat: 'table' as 'table' | 'sections',
  manualAcceptance: null as null | {
    accepted_at: string
    accepted_by: string
    evidence_description: string
  },
  emailSentAt: '',
  contractId: '',
}))
const approval = vi.hoisted(() => ({
  run: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  button: null as ComponentProps<typeof UI.Button> | null,
}))
vi.mock('@doscientos/ui', async (original) => {
  const ui = await original<typeof UI>()
  return {
    ...ui,
    toast: Object.assign(vi.fn(), ui.toast, { success: approval.success, error: approval.error }),
    Button: (props: ComponentProps<typeof UI.Button>) => {
      if (props['aria-label'] === 'Marcar como aprobado') approval.button = props
      return <ui.Button {...props} />
    },
  }
})
vi.mock('../application/record-manual-approval', () => ({ recordManualApproval: approval.run }))
const estimate = {
  id: 'estimate',
  tenantId: 'tenant',
  number: 'P-1',
  clientId: 'client',
  title: 'Trabajo',
  status: 'draft',
  lines: [],
  milestones: [],
  discountType: 'none',
  discountValue: 0,
  vatRate: 21,
  validUntil: '2026-12-01',
  createdAt: '2026-11-01',
  clauses: '',
} as Estimate
const sections: NonNullable<Estimate['sections']> = [
  { id: 'price', type: 'prices', title: 'Precio', pageBreakBefore: false, lineIds: [] },
  { id: 'services', type: 'work_table', title: 'Servicios', pageBreakBefore: false, rows: [] },
]

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <a href="/presupuestos" className={className}>
      {children}
    </a>
  ),
  useNavigate: () => vi.fn(),
}))
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal()),
  useQuery: ({ queryKey }: { queryKey: string[] }) => ({
    data:
      queryKey[0] === 'estimate-publication'
        ? {
            estimate: {
              ...estimate,
              status: state.status,
              automaticContract: state.automaticContract,
              conversionDestination: state.purpose,
            },
            client: { name: 'Cliente' },
            tenant: { name: 'Empresa' },
          }
        : queryKey[0] === 'estimate-manual-acceptance'
          ? state.manualAcceptance
          : queryKey[0] === 'estimate-contract'
            ? state.contractId || null
            : queryKey[0] === 'work-target-options'
              ? { locations: [], assets: [] }
              : null,
    isPending: false,
  }),
}))
vi.mock('@/features/auth', () => ({ can, useSession: () => ({ role: state.role }) }))
vi.mock('@/shared/store/store', () => ({
  useTenantData: () => ({
    tenant: { id: 'tenant', name: 'Empresa' },
    clients: [{ id: 'client', name: 'Cliente' }],
    estimates: [
      {
        ...estimate,
        status: state.status,
        automaticContract: state.automaticContract,
        conversionDestination: state.purpose,
        documentFormat: state.documentFormat,
        sections,
        emailSentAt: state.emailSentAt,
      },
    ],
    catalog: [],
    ledger: [],
  }),
  refreshStore: vi.fn(),
  getSaveStatus: () => ({ state: 'saved' }),
  useSaveStatus: () => ({ state: 'saved' }),
  retryStoreSaves: vi.fn(),
}))
vi.mock('./estimate-document', () => ({ EstimateDocument: () => null }))
vi.mock('./lines-editor', () => ({ LinesEditor: () => null }))
vi.mock('./milestones-editor', () => ({ MilestonesEditor: () => null }))
vi.mock('@/features/clients/ui/client-form-dialog', () => ({ ClientFormDialog: () => null }))
vi.mock('@/features/clients/ui/related-record-creation', () => ({
  RelatedCreateButton: ({ label }: { label: string }) => <button>{label}</button>,
  useRelatedRecordCreation: () => ({
    allowed: state.role === 'admin',
    pending: false,
    status: null,
    dialogs: null,
    start: vi.fn(),
  }),
}))

import { EstimateDraftProvider } from './estimate-draft-context'
import { EstimateEditorPage } from './estimate-editor-page'

beforeEach(() => {
  vi.clearAllMocks()
  approval.run.mockResolvedValue(undefined)
  approval.button = null
  state.status = 'draft'
  state.role = 'admin'
  state.automaticContract = false
  state.purpose = 'contract'
  state.documentFormat = 'table'
  state.manualAcceptance = null
  state.emailSentAt = ''
  state.contractId = ''
})

describe('acceso a la aprobación del presupuesto', () => {
  function pressApproval() {
    if (!approval.button?.onPress) throw new Error('Missing approval action')
    approval.button.onPress({} as never)
  }

  it('offers a work order instead of a contract for an accepted installation', () => {
    state.status = 'accepted'
    state.purpose = 'work'
    const html = renderToStaticMarkup(<EstimateEditorPage estimateId="estimate" />)
    expect(html).toContain('Instalación · obra puntual')
    expect(html).toContain('Planear trabajo')
    expect(html).not.toContain('Crear contrato')
  })

  it.each(['draft', 'sent'])(
    'aprueba un presupuesto %s con un clic sin pedir persona ni comprobante',
    async (status) => {
      state.status = status
      const html = renderToStaticMarkup(<EstimateEditorPage estimateId="estimate" />)
      expect(html).not.toContain('Nombre de quien aceptó')
      expect(html).not.toContain('Referencia de la evidencia')
      expect(html).not.toContain('Confirmar aprobación')
      pressApproval()
      expect(approval.run).toHaveBeenCalledWith({
        status,
        tenantId: 'tenant',
        estimateId: 'estimate',
        operationId: expect.any(String),
        onPublished: expect.any(Function),
      })
      await vi.waitFor(() => expect(approval.success).toHaveBeenCalledWith('Presupuesto aprobado'))
    },
  )

  it('evita enviar dos aprobaciones mientras la primera está pendiente', async () => {
    let finish: (() => void) | undefined
    approval.run.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    renderToStaticMarkup(<EstimateEditorPage estimateId="estimate" />)
    pressApproval()
    pressApproval()
    expect(approval.run).toHaveBeenCalledOnce()
    if (!finish) throw new Error('Approval was not started')
    finish()
    await vi.waitFor(() => expect(approval.success).toHaveBeenCalledWith('Presupuesto aprobado'))
  })

  it('muestra el error y permite reintentar con la misma clave de operación', async () => {
    approval.run.mockRejectedValueOnce(new Error('Sin conexión'))
    renderToStaticMarkup(<EstimateEditorPage estimateId="estimate" />)
    pressApproval()
    await vi.waitFor(() =>
      expect(approval.error).toHaveBeenCalledWith(
        'No se pudo aprobar el presupuesto',
        expect.objectContaining({
          description: expect.stringContaining('Sin conexión'),
        }),
      ),
    )
    pressApproval()
    expect(approval.run).toHaveBeenCalledTimes(2)
    expect(approval.run.mock.calls[1]?.[0].operationId).toBe(
      approval.run.mock.calls[0]?.[0].operationId,
    )
    await vi.waitFor(() => expect(approval.success).toHaveBeenCalledWith('Presupuesto aprobado'))
  })

  it('offers a final submit for new estimates without autosave or premature sending actions', () => {
    const html = renderToStaticMarkup(
      <EstimateDraftProvider
        value={{ estimate, patch: vi.fn(), busy: false, submitted: false, error: null }}
      >
        <EstimateEditorPage estimateId="estimate" />
      </EstimateDraftProvider>,
    )
    expect(html).toContain('Nuevo presupuesto')
    expect(html).toContain('type="submit"')
    expect(html).toContain('Crear presupuesto')
    expect(html).not.toContain('Los cambios válidos se guardan automáticamente')
    expect(html).not.toContain('Enviar por email')
    expect(html).not.toContain('Marcar como aprobado')
    expect(html).not.toContain('IVA %')
  })

  it('does not expose VAT as an editable general field for existing estimates either', () => {
    const html = renderToStaticMarkup(<EstimateEditorPage estimateId="estimate" />)
    expect(html).not.toContain('IVA %')
    expect(html).toContain('IVA 21%')
  })

  it.each(['create', 'edit'])(
    'does not duplicate pricing or discounts in section estimates on %s',
    (mode) => {
      state.documentFormat = 'sections'
      const page = <EstimateEditorPage estimateId="estimate" />
      const html = renderToStaticMarkup(
        mode === 'create' ? (
          <EstimateDraftProvider
            value={{
              estimate: {
                ...estimate,
                documentFormat: 'sections',
                conversionDestination: 'contract',
                sections,
              },
              patch: vi.fn(),
              busy: false,
              submitted: false,
              error: null,
            }}
          >
            {page}
          </EstimateDraftProvider>
        ) : (
          page
        ),
      )
      expect(html).toContain('Precio con impuestos incluidos')
      expect(html).toContain('Periodicidad')
      expect(html).not.toContain('Resumen económico')
      expect(html).not.toContain('Descuento global')
      expect(html).not.toContain('Sin descuento')
      expect(html).not.toContain('Base imponible')
    },
  )

  it('preserves discounts and totals for traditional line estimates', () => {
    const html = renderToStaticMarkup(<EstimateEditorPage estimateId="estimate" />)
    expect(html).toContain('Partidas')
    expect(html).toContain('Descuento global')
    expect(html).toContain('Sin descuento')
    expect(html).toContain('Base imponible')
  })

  it('shows the automatic save guidance only while the estimate is editable', () => {
    expect(renderToStaticMarkup(<EstimateEditorPage estimateId="estimate" />)).toContain(
      'Los cambios válidos se guardan automáticamente',
    )
    state.status = 'sent'
    expect(renderToStaticMarkup(<EstimateEditorPage estimateId="estimate" />)).not.toContain(
      'Los cambios válidos se guardan automáticamente',
    )
  })

  it.each(['draft', 'sent'])('permite aprobar un presupuesto %s a un administrador', (status) => {
    state.status = status
    const html = renderToStaticMarkup(<EstimateEditorPage estimateId="estimate" />)
    expect(html).toContain('Marcar como aprobado')
  })

  it.each(['accepted', 'rejected'])('no ofrece aprobar uno %s', (status) => {
    state.status = status
    const html = renderToStaticMarkup(<EstimateEditorPage estimateId="estimate" />)
    expect(html).not.toContain('Marcar como aprobado')
  })

  it('no ofrece aprobar a un usuario sin permisos', () => {
    state.role = 'user'
    const html = renderToStaticMarkup(<EstimateEditorPage estimateId="estimate" />)
    expect(html).not.toContain('Marcar como aprobado')
  })

  it('does not offer a second manual conversion for an automatically accepted contract', () => {
    state.status = 'accepted'
    state.automaticContract = true
    const html = renderToStaticMarkup(<EstimateEditorPage estimateId="estimate" />)
    expect(html).not.toContain('Crear contrato')
    expect(html).toContain('Recargar contrato')
    expect(html).not.toContain('Piscina o activo')
  })

  it('preserves conversion for legacy published proposals', () => {
    state.status = 'accepted'
    const html = renderToStaticMarkup(<EstimateEditorPage estimateId="estimate" />)
    expect(html).toContain('Crear contrato')
    expect(html).toContain('Crear centro')
    expect(html).not.toContain('Piscina o activo')
  })

  it('keeps approval and sending evidence in a compact expandable detail', () => {
    state.status = 'accepted'
    state.contractId = 'contract'
    state.manualAcceptance = {
      accepted_at: '2026-11-13T15:27:42Z',
      accepted_by: 'Oficina',
      evidence_description: 'Aprobación directa',
    }
    state.emailSentAt = '2026-11-13T15:30:00Z'
    const html = renderToStaticMarkup(<EstimateEditorPage estimateId="estimate" />)
    expect(html).toContain('<details')
    expect(html).toContain('<summary')
    expect(html).toContain('Detalles de aprobación y envío')
    expect(html).toContain('Aprobación directa')
    expect(html).toContain('Último envío confirmado')
    expect(html).not.toContain(
      'Las partidas y condiciones del presupuesto publicado están bloqueadas',
    )
    expect(html).not.toContain('Correo: sin confirmación')
    expect(html).toMatch(/class="[^"]*inline-flex[^"]*"[^>]*>Abrir contrato/)
    expect(html).toContain('data-size="icon-lg"')
  })

  it('does not show empty approval or email notices', () => {
    state.status = 'sent'
    const html = renderToStaticMarkup(<EstimateEditorPage estimateId="estimate" />)
    expect(html).not.toContain('Detalles de aprobación y envío')
    expect(html).not.toContain('Correo: sin confirmación')
  })

  it('keeps published details readable and document actions accessible on mobile', () => {
    state.status = 'sent'
    const html = renderToStaticMarkup(<EstimateEditorPage estimateId="estimate" />)
    expect(html).toContain('aria-label="Resumen del presupuesto"')
    expect(html).toContain('Trabajo')
    expect(html).toContain('Cliente')
    expect(html).toContain('2026-12-01')
    expect(html).toContain('aria-label="Enviar por email"')
    expect(html).toContain('aria-label="Imprimir o guardar PDF"')
    expect(html).toContain('aria-label="Páginas del presupuesto"')
    expect(html).toContain('max-h-[65dvh]')
  })
})
