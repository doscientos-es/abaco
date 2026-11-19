import { Checkbox } from '@doscientos/ui'
import type { ReactNode } from 'react'

import { EstimateDesignExample } from '@/features/estimates'
import { InvoiceDocument } from '@/features/invoices'
import {
  defaultInvoiceAppearance,
  type InvoiceAppearance,
} from '@/shared/domain/document-appearance'
import type { DocumentLibrary } from '@/shared/domain/document-library'
import type { EstimateDesign } from '@/shared/domain/estimate-design'
import type { InvoiceDesign } from '@/shared/domain/invoice-design'
import type { Client, Invoice, Tenant } from '@/shared/domain/types'
import { DocumentAppearanceFields } from '@/shared/ui/document-appearance-fields'
import { DocumentPreview } from '@/shared/ui/document-preview'
import { EstimateDesignFields } from '@/shared/ui/estimate-design-fields'
import { TextareaField } from '@/shared/ui/form'
import { VisualRadioGroup } from '@/shared/ui/visual-radio-group'

import { DocumentTemplatesEditor, useDocumentTemplates } from './document-templates-editor'
import { DocumentTypeTabs } from './document-type-tabs'
import { EstimateBlockLibrary } from './estimate-block-library'
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
  {
    value: 'artistic',
    label: 'Artística',
    description: 'Composición asimétrica y tipografía editorial.',
  },
] as const
const invoiceOptions = invoiceLayouts.map((option) => ({
  ...option,
  illustration:
    option.value === 'artistic' ? (
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 48 64"
        fill="none"
        className="text-primary mx-auto block h-16 w-12"
      >
        <rect x="0.5" y="0.5" width="47" height="63" className="fill-card stroke-border" />
        <path d="M23 1h24v25z" className="fill-primary/20" />
        <path d="M27 16h14" stroke="currentColor" strokeWidth="3" />
        <path d="M7 14h10m-10 4h7m-7 21h34m-34 5h34" className="stroke-border" />
        <path d="M7 25v9" stroke="currentColor" />
        <rect x="24" y="48" width="17" height="7" rx="1" className="fill-primary/20" />
      </svg>
    ) : (
      <span
        aria-hidden="true"
        className="border-border bg-card mx-auto block h-16 w-12 border p-1.5"
      >
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
  design: baseDesign,
  onDesignChange,
  invoiceDesign: baseInvoiceDesign,
  onInvoiceDesignChange,
  footer,
  onFooterChange,
  library,
  onLibraryChange,
  saveActions,
}: {
  tenant: Tenant
  design: EstimateDesign
  onDesignChange: (value: EstimateDesign) => void
  invoiceDesign: InvoiceDesign
  onInvoiceDesignChange: (value: InvoiceDesign) => void
  footer: string
  onFooterChange: (value: string) => void
  library: DocumentLibrary
  onLibraryChange: (value: DocumentLibrary) => void
  saveActions: ReactNode
}) {
  const estimates = useDocumentTemplates(
    library.estimates,
    library.defaultEstimateId,
    (items, defaultId) =>
      onLibraryChange({ ...library, estimates: items, defaultEstimateId: defaultId }),
  )
  const invoices = useDocumentTemplates(
    library.invoices,
    library.defaultInvoiceId,
    (items, defaultId) =>
      onLibraryChange({ ...library, invoices: items, defaultInvoiceId: defaultId }),
  )
  const design = estimates.selected?.design ?? baseDesign
  const invoiceDesign = invoices.selected?.design ?? baseInvoiceDesign
  const invoiceAppearance =
    invoices.selected?.appearance ?? library.invoiceAppearance ?? defaultInvoiceAppearance

  function changeInvoiceAppearance(appearance: InvoiceAppearance) {
    if (invoices.selected) invoices.update({ ...invoices.selected, appearance })
    else onLibraryChange({ ...library, invoiceAppearance: appearance })
  }

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
                    previewAppearance={invoiceAppearance}
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
                  <>
                    <DocumentTemplatesEditor
                      key="estimate"
                      {...estimates.controls}
                      onCreate={(name) =>
                        estimates.controls.onCreate({ id: crypto.randomUUID(), name, design })
                      }
                    />
                    <EstimateDesignFields
                      value={design}
                      brandColor={tenant.brandColor}
                      onChange={(next) => {
                        if (estimates.selected)
                          estimates.update({ ...estimates.selected, design: next })
                        else onDesignChange(next)
                      }}
                    />
                  </>
                ) : (
                  <>
                    <DocumentTemplatesEditor
                      key="invoice"
                      {...invoices.controls}
                      onCreate={(name) =>
                        invoices.controls.onCreate({
                          id: crypto.randomUUID(),
                          name,
                          design: invoiceDesign,
                          appearance: invoiceAppearance,
                        })
                      }
                    />
                    <VisualRadioGroup
                      label="Diseño base"
                      value={invoiceDesign}
                      options={invoiceOptions}
                      onChange={(next) => {
                        if (invoices.selected)
                          invoices.update({ ...invoices.selected, design: next })
                        else onInvoiceDesignChange(next)
                      }}
                      compact
                    />
                    <fieldset className="grid gap-2">
                      <legend className="mb-2 text-sm font-medium">Elementos visibles</legend>
                      <Checkbox
                        isSelected={invoiceAppearance.showLogo}
                        onChange={(showLogo) =>
                          changeInvoiceAppearance({ ...invoiceAppearance, showLogo })
                        }
                      >
                        Mostrar logo de empresa
                      </Checkbox>
                      <Checkbox
                        isSelected={invoiceAppearance.showContact}
                        onChange={(showContact) =>
                          changeInvoiceAppearance({ ...invoiceAppearance, showContact })
                        }
                      >
                        Mostrar teléfono, correos y web
                      </Checkbox>
                      <p className="text-muted-foreground text-xs">
                        Los datos fiscales y el pie legal no se pueden ocultar.
                      </p>
                    </fieldset>
                    <DocumentAppearanceFields
                      value={invoiceAppearance}
                      brandColor={tenant.brandColor}
                      showLogo={invoiceAppearance.showLogo}
                      onChange={(appearance) =>
                        changeInvoiceAppearance({ ...invoiceAppearance, ...appearance })
                      }
                    />
                  </>
                )}
                <TextareaField
                  label="Pie de página de los documentos"
                  maxLength={500}
                  placeholder="Añade tus datos registrales o una nota para el cliente."
                  helper="Se usa en presupuestos y facturas; los documentos publicados conservan su copia."
                  value={footer}
                  onChange={onFooterChange}
                />
                {isEstimate ? (
                  <EstimateBlockLibrary
                    blocks={library.blocks}
                    onChange={(blocks) => onLibraryChange({ ...library, blocks })}
                  />
                ) : null}
              </>
            }
          />
        )
      }}
    </DocumentTypeTabs>
  )
}
