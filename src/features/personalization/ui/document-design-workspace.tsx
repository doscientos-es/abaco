import type { ReactNode } from 'react'

import { EstimateDesignExample } from '@/features/estimates'
import { InvoiceDocument } from '@/features/invoices'
import type { EstimateDesign } from '@/shared/domain/estimate-design'
import type { InvoiceDesign } from '@/shared/domain/invoice-design'
import type { Client, Invoice, Tenant } from '@/shared/domain/types'
import { DocumentPreview } from '@/shared/ui/document-preview'
import { EstimateDesignFields } from '@/shared/ui/estimate-design-fields'
import { TextareaField } from '@/shared/ui/form'
import { VisualRadioGroup } from '@/shared/ui/visual-radio-group'

import { DocumentTypeTabs } from './document-type-tabs'
import { PersonalizationWorkspace } from './personalization-workspace'

const client: Client = {
  id: 'example',
  tenantId: 'example',
  name: 'Cliente de ejemplo',
  taxId: '',
  email: '',
  phone: '',
  address: 'Calle del Ejemplo, 12',
  notes: '',
}

const invoice: Invoice = {
  id: 'example',
  tenantId: 'example',
  number: 'DEMO-001',
  clientId: client.id,
  estimateId: null,
  milestoneId: null,
  workExtraId: null,
  concept: 'Servicio de mantenimiento',
  totalCents: 30250,
  paidCents: 0,
  vatRate: 21,
  status: 'issued',
  documentStatus: 'issued',
  emailAcceptedAt: null,
  issuedAt: '2026-11-19',
  dueDate: '2026-12-19',
}

const invoiceLayouts = [
  { value: 'classic', label: 'Clásica', description: 'El diseño habitual.' },
  { value: 'modern', label: 'Moderna', description: 'Bloques destacados.' },
  { value: 'minimal', label: 'Minimalista', description: 'Limpia y discreta.' },
] as const
const invoiceOptions = invoiceLayouts.map((option) => ({
  ...option,
  illustration: (
    <span aria-hidden="true" className="border-border bg-card mx-auto block h-16 w-12 border p-1.5">
      <span
        className={
          option.value === 'minimal' ? 'bg-muted block h-1 w-5' : 'bg-primary block h-1 w-full'
        }
      />
      <span
        className={
          option.value === 'modern'
            ? 'bg-muted mt-2 block h-4'
            : 'border-border mt-2 block h-4 border-b'
        }
      />
      <span className="bg-muted mt-1 block h-1 w-full" />
    </span>
  ),
}))

export function DocumentDesignWorkspace({
  tenant,
  design,
  onDesignChange,
  invoiceDesign,
  onInvoiceDesignChange,
  footer,
  onFooterChange,
  saveActions,
}: {
  tenant: Tenant
  design: EstimateDesign
  onDesignChange: (value: EstimateDesign) => void
  invoiceDesign: InvoiceDesign
  onInvoiceDesignChange: (value: InvoiceDesign) => void
  footer: string
  onFooterChange: (value: string) => void
  saveActions: ReactNode
}) {
  const previewTenant = { ...tenant, documentFooter: footer.trim() }
  return (
    <DocumentTypeTabs label="Tipo de documento">
      {(type) => {
        const isEstimate = type === 'estimate'
        return (
          <PersonalizationWorkspace
            previewLabel={isEstimate ? 'Páginas del presupuesto' : 'Páginas de la factura'}
            controlsLabel="Personalizar documento"
            saveActions={saveActions}
            preview={
              <DocumentPreview label={null}>
                {isEstimate ? (
                  <EstimateDesignExample design={design} tenant={previewTenant} />
                ) : (
                  <InvoiceDocument
                    invoice={invoice}
                    client={client}
                    tenant={previewTenant}
                    previewDesign={invoiceDesign}
                  />
                )}
              </DocumentPreview>
            }
            controls={
              <>
                <div>
                  <h2 className="text-sm font-semibold">
                    {isEstimate ? 'Diseño de presupuestos' : 'Diseño de facturas'}
                  </h2>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {isEstimate
                      ? 'Se copia a los presupuestos nuevos; no modifica los publicados.'
                      : 'Se aplica a las facturas nuevas; no modifica las ya emitidas.'}
                  </p>
                </div>
                {isEstimate ? (
                  <EstimateDesignFields value={design} onChange={onDesignChange} />
                ) : (
                  <VisualRadioGroup
                    label="Plantilla"
                    value={invoiceDesign}
                    options={invoiceOptions}
                    onChange={onInvoiceDesignChange}
                    compact
                  />
                )}
                <TextareaField
                  label="Pie de página de los documentos"
                  maxLength={500}
                  placeholder="Añade tus datos registrales o una nota para el cliente."
                  helper="Se usa en presupuestos y facturas; los documentos publicados conservan su copia."
                  value={footer}
                  onChange={onFooterChange}
                />
              </>
            }
          />
        )
      }}
    </DocumentTypeTabs>
  )
}
