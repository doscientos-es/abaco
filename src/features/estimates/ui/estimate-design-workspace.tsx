import type { ReactNode, Ref } from 'react'

import type { EstimateDesign } from '@/shared/domain/estimate-design'
import type { Client, Estimate, Tenant } from '@/shared/domain/types'
import { DocumentPreview } from '@/shared/ui/document-preview'

import { EstimateDocument } from './estimate-document'

export function EstimateDesignWorkspace({
  controls,
  estimate,
  client,
  tenant,
  documentRef,
  example = false,
}: {
  controls?: ReactNode
  estimate: Estimate
  client: Client | undefined
  tenant: Tenant
  documentRef?: Ref<HTMLElement>
  example?: boolean
}) {
  const preview = (
    <DocumentPreview label={example ? 'de ejemplo' : 'del presupuesto'}>
      <EstimateDocument
        estimate={estimate}
        client={client}
        tenant={tenant}
        documentRef={documentRef}
      />
    </DocumentPreview>
  )
  if (!controls) return preview

  return (
    <div className="@container">
      <div className="grid min-w-0 items-start gap-5 @min-[43rem]:grid-cols-[minmax(18rem,21rem)_minmax(0,1fr)] print:block">
        <div className="min-w-0 print:hidden">{controls}</div>
        <div className="min-w-0 @min-[43rem]:sticky @min-[43rem]:top-4">
          <div className="text-muted-foreground mb-2 flex items-center gap-2 text-xs font-medium print:hidden">
            <span aria-hidden="true" className="bg-primary size-1.5 rounded-full" />
            Vista previa en directo{example ? ' · Documento de ejemplo' : ''}
          </div>
          <div
            role="region"
            aria-label={example ? 'Páginas del presupuesto de ejemplo' : 'Páginas del presupuesto'}
            tabIndex={0}
            className="focus-visible:outline-ring min-w-0 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 @min-[43rem]:max-h-[min(72dvh,52rem)] @min-[43rem]:overflow-auto print:max-h-none print:overflow-visible"
          >
            {preview}
          </div>
        </div>
      </div>
    </div>
  )
}

const exampleClient: Client = {
  id: 'example-client',
  tenantId: 'example',
  name: 'Cliente de ejemplo',
  taxId: '',
  email: '',
  phone: '',
  address: 'Calle del Ejemplo, 12',
  notes: '',
}

const exampleEstimate: Estimate = {
  id: 'example-estimate',
  tenantId: 'example',
  clientId: exampleClient.id,
  number: 'DEMO-001',
  title: 'Servicio de mantenimiento',
  status: 'draft',
  lines: [
    {
      id: 'labour',
      catalogItemId: null,
      description: 'Revisión y puesta a punto',
      kind: 'labor',
      unit: 'h',
      quantity: 4,
      unitPriceCents: 4500,
      discountPercent: 0,
    },
    {
      id: 'materials',
      catalogItemId: null,
      description: 'Materiales y consumibles',
      kind: 'material',
      unit: 'ud',
      quantity: 1,
      unitPriceCents: 6500,
      discountPercent: 0,
    },
  ],
  milestones: [{ id: 'completion', label: 'Al finalizar', percent: 100 }],
  discountType: 'none',
  discountValue: 0,
  vatRate: 21,
  clauses: 'La fecha del servicio se confirmará al aceptar el presupuesto.',
  createdAt: '2026-11-19',
  validUntil: '2026-12-19',
}

export function EstimateDesignExample({
  controls,
  design,
  tenant,
}: {
  controls: ReactNode
  design: EstimateDesign
  tenant: Tenant
}) {
  return (
    <EstimateDesignWorkspace
      controls={controls}
      estimate={{ ...exampleEstimate, vatRate: tenant.defaultVatRate, documentDesign: design }}
      client={exampleClient}
      tenant={tenant}
      example
    />
  )
}
