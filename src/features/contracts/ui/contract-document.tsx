import { Button, toast } from '@doscientos/ui'
import { useQuery } from '@tanstack/react-query'
import { useImperativeHandle, useRef, type Ref } from 'react'

import { loadPublishedEstimate } from '@/features/estimates/application/estimate-publication-actions'
import { EstimateDocument } from '@/features/estimates/ui/estimate-document'
import { contractBillingLabels } from '@/shared/domain/contract-billing'
import { formatEuros } from '@/shared/domain/money'
import type { Client, Tenant } from '@/shared/domain/types'
import { printDocument } from '@/shared/lib/print-document'

import type { ServiceContract } from '../application/contract-actions'
import type { ContractDocumentSection } from '../application/contract-document-template-actions'
import { ApplyContractTemplateButton } from './apply-contract-template-button'
import { ContractTemplateContent } from './contract-template-content'

export type ContractDocumentHandle = { print: () => void }

export function ContractDocument({
  contract,
  tenant,
  client,
  canEdit = false,
  ref,
}: {
  contract: ServiceContract
  tenant: Tenant
  client: Client | undefined
  canEdit?: boolean
  ref?: Ref<ContractDocumentHandle>
}) {
  const document = useRef<HTMLElement>(null)
  const publication = useQuery({
    queryKey: ['estimate-publication', contract.tenant_id, contract.origin_estimate_id],
    queryFn: () => loadPublishedEstimate(contract.tenant_id, contract.origin_estimate_id ?? ''),
    enabled: Boolean(contract.origin_estimate_id),
  })
  const issuer = publication.data?.tenant ?? tenant
  const customer = publication.data?.client ?? client
  const waiting = Boolean(contract.origin_estimate_id) && publication.isPending
  const unavailable = Boolean(contract.origin_estimate_id) && publication.isError

  function print(fromSummary = false) {
    if (waiting || unavailable || !document.current) {
      toast.error(
        waiting ? 'El documento todavía se está preparando' : 'No se pudo preparar el documento',
        unavailable
          ? { description: 'No se pudo cargar el presupuesto aceptado. Reinténtalo en Documento.' }
          : {},
      )
      return
    }
    if (fromSummary && publication.data?.source === 'migration') {
      toast.error('Revisa el presupuesto reconstruido antes de generar el documento', {
        description: 'Abre la pestaña Documento para comprobar el anexo.',
      })
      return
    }
    void printDocument(document.current, `Contrato ${contract.title}`).catch(() =>
      toast.error('No se pudo preparar el documento'),
    )
  }
  useImperativeHandle(ref, () => ({ print: () => print(true) }))

  return (
    <section className="space-y-3 rounded-lg border p-4" aria-label="Documento del contrato">
      <h2 className="text-lg font-semibold">Documento del contrato</h2>
      <p className="text-muted-foreground text-sm">
        Revisa los datos y las condiciones antes de guardar o firmar el documento. El presupuesto
        aceptado se incluye como anexo.
      </p>
      {canEdit && contract.status === 'draft' && !contract.signed_at ? (
        <ApplyContractTemplateButton contract={contract} />
      ) : null}
      {waiting ? <output>Cargando presupuesto aceptado…</output> : null}
      {unavailable ? (
        <p role="alert">
          No se pudo cargar el presupuesto aceptado. Reinténtalo antes de generar el documento.
        </p>
      ) : null}
      {publication.data?.source === 'migration' ? (
        <p role="alert" className="text-sm">
          El presupuesto anexo se reconstruyó durante una migración. Comprueba su contenido antes de
          utilizarlo como acuerdo.
        </p>
      ) : null}
      {!waiting && !unavailable ? (
        <>
          <Button variant="outline" onPress={() => print()}>
            Imprimir o guardar contrato en PDF
          </Button>
          <details>
            <summary className="cursor-pointer text-sm font-medium">
              Vista previa del contrato
            </summary>
            <article
              ref={document}
              className="paper-sheet contract-document space-y-6 bg-white p-6 text-sm text-black"
            >
              <header>
                <h1 className="text-xl font-semibold">Contrato de prestación de servicios</h1>
                <p>{contract.title}</p>
                {contract.status === 'draft' ? <p>Borrador pendiente de formalización</p> : null}
              </header>
              <section>
                <h2 className="font-semibold">Partes</h2>
                <p>
                  Prestador: {issuer.name}
                  {issuer.taxId ? ` · ${issuer.taxId}` : ''}
                </p>
                <p>
                  Cliente: {customer?.name ?? 'Pendiente'}
                  {customer?.taxId ? ` · ${customer.taxId}` : ''}
                </p>
                {customer?.address ? <p>Domicilio del cliente: {customer.address}</p> : null}
              </section>
              <section>
                <h2 className="font-semibold">Objeto y alcance</h2>
                <p>{contract.title}</p>
                <ul className="list-inside list-disc">
                  {contract.included_scope.map((item, index) => (
                    <li key={index}>{item.description}</li>
                  ))}
                </ul>
                {publication.data ? (
                  <p>
                    El alcance y las condiciones detalladas figuran en el presupuesto aceptado que
                    se incorpora como anexo.
                  </p>
                ) : null}
              </section>
              <section>
                <h2 className="font-semibold">Vigencia y renovación</h2>
                <p>
                  Inicio: {contract.starts_on}. Fin: {contract.ends_on ?? 'pendiente de acordar'}.
                </p>
                <p>
                  Renovación:{' '}
                  {contract.renewal_mode === 'pending'
                    ? 'pendiente de acordar'
                    : contract.renewal_mode === 'automatic'
                      ? 'automática, según acuerdo'
                      : 'manual'}
                  .
                </p>
              </section>
              <section>
                <h2 className="font-semibold">Precio</h2>
                <p>
                  {formatEuros(contract.price_cents)} antes de impuestos ·{' '}
                  {contractBillingLabels[contract.billing_frequency]}.
                </p>
                {publication.data ? (
                  <p>
                    El impuesto y las demás condiciones económicas figuran en el presupuesto anexo.
                  </p>
                ) : null}
              </section>
              {contract.notes ? (
                <section>
                  <h2 className="font-semibold">Condiciones adicionales</h2>
                  <p className="whitespace-pre-wrap">{contract.notes}</p>
                </section>
              ) : null}
              <TemplateSections sections={contract.document_sections?.before ?? []} />
              {!contract.document_sections ? <Signatures /> : null}
              {publication.data ? (
                <section className="contract-annex pt-8">
                  <h2 className="mb-3 text-lg font-semibold">Anexo · Presupuesto aceptado</h2>
                  <EstimateDocument
                    estimate={publication.data.estimate}
                    client={publication.data.client}
                    tenant={publication.data.tenant}
                    paginated={false}
                  />
                </section>
              ) : null}
              <TemplateSections sections={contract.document_sections?.after ?? []} />
              {contract.document_sections ? <Signatures /> : null}
            </article>
          </details>
        </>
      ) : null}
    </section>
  )
}

/** Render the contract's saved copy, never the current company template. */
function TemplateSections({ sections }: { sections: ContractDocumentSection[] }) {
  return sections.map((section) => <ContractTemplateContent key={section.id} section={section} />)
}

function Signatures() {
  return (
    <section className="grid grid-cols-2 gap-8 pt-12">
      <p className="border-t pt-2">Firma del prestador</p>
      <p className="border-t pt-2">Firma del cliente</p>
    </section>
  )
}
