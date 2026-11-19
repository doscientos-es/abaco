import { useState } from 'react'

import { EstimateDesignExample } from '@/features/estimates'
import { InvoiceDocument } from '@/features/invoices'
import type { EstimateDesign } from '@/shared/domain/estimate-design'
import type { InvoiceDesign } from '@/shared/domain/invoice-design'
import type { Client, Invoice, Tenant } from '@/shared/domain/types'
import { DocumentPreview } from '@/shared/ui/document-preview'
import { EstimateDesignFields } from '@/shared/ui/estimate-design-fields'
import { TextareaField } from '@/shared/ui/form'
import { VisualRadioGroup } from '@/shared/ui/visual-radio-group'

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
}: {
  tenant: Tenant
  design: EstimateDesign
  onDesignChange: (value: EstimateDesign) => void
  invoiceDesign: InvoiceDesign
  onInvoiceDesignChange: (value: InvoiceDesign) => void
  footer: string
  onFooterChange: (value: string) => void
}) {
  const [documentType, setDocumentType] = useState<'estimate' | 'invoice'>('estimate')
  const previewTenant = { ...tenant, documentFooter: footer.trim() }
  return (
    <div className="space-y-4">
      <label className="flex flex-wrap items-center gap-3 text-sm font-medium">
        Tipo de documento
        <select
          value={documentType}
          onChange={(event) => setDocumentType(event.target.value as 'estimate' | 'invoice')}
          className="border-border bg-background rounded-md border px-3 py-2"
        >
          <option value="estimate">Presupuesto</option>
          <option value="invoice">Factura</option>
        </select>
      </label>
      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)]">
        <div className="min-w-0">
          {documentType === 'estimate' ? (
            <EstimateDesignExample design={design} tenant={previewTenant} />
          ) : (
            <DocumentPreview label="en directo · Documento de ejemplo">
              <InvoiceDocument
                invoice={invoice}
                client={client}
                tenant={previewTenant}
                previewDesign={invoiceDesign}
              />
            </DocumentPreview>
          )}
        </div>
        <details open className="border-border bg-card min-w-0 rounded-xl border p-5">
          <summary className="cursor-pointer text-sm font-semibold">Personalizar documento</summary>
          <div className="mt-5 space-y-5">
            <div>
              <h2 className="text-sm font-semibold">
                {documentType === 'estimate' ? 'Diseño de presupuestos' : 'Diseño de facturas'}
              </h2>
              <p className="text-muted-foreground mt-1 text-xs">
                {documentType === 'estimate'
                  ? 'Se copia a los presupuestos nuevos; no modifica los publicados.'
                  : 'Se aplica a las facturas nuevas; no modifica las ya emitidas.'}
              </p>
            </div>
            {documentType === 'estimate' ? (
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
              helper="Se usa en presupuestos y facturas nuevos."
              value={footer}
              onChange={onFooterChange}
            />
          </div>
        </details>
      </div>
    </div>
  )
}
