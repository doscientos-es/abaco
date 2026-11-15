import { ArrowRight, ArrowSquareOut, EnvelopeSimple, FilePdf, Eye } from '@phosphor-icons/react'

import type { Client } from '@/shared/domain/types'

import type { ServiceContract } from '../application/contract-actions'

export function contractEmailLink(
  contract: ServiceContract,
  client: Client | undefined,
): string | null {
  const email = client?.email?.trim()
  if (!client || !email || !/^[^\s@?&#]+@[^\s@?&#]+\.[^\s@?&#]+$/.test(email)) return null
  const subject = `Contrato · ${contract.title}`
  const body = `Hola ${client.name},\n\nTe compartimos el contrato «${contract.title}».\n\nUn saludo.`
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export function ContractQuickActions({
  contract,
  client,
  onPrint,
  onViewDocument,
}: {
  contract: ServiceContract
  client?: Client | undefined
  onPrint: () => void
  onViewDocument: () => void
}) {
  const email = contractEmailLink(contract, client)
  const actionClass =
    'group border-border bg-background hover:border-primary/40 hover:bg-primary/5 focus-visible:ring-ring flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none active:bg-primary/10'
  return (
    <section className="border-border bg-card rounded-xl border p-5" aria-label="Acciones rápidas">
      <h2 className="font-semibold">Acciones rápidas</h2>
      <div className="mt-3 space-y-2">
        <button type="button" className={actionClass} onClick={onPrint}>
          <span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg">
            <FilePdf className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Guardar contrato en PDF</span>
            <span className="text-muted-foreground block text-xs">
              Imprimir o guardar desde el navegador
            </span>
          </span>
          <ArrowRight
            className="text-muted-foreground group-hover:text-primary size-4 shrink-0"
            aria-hidden="true"
          />
        </button>
        <button type="button" className={actionClass} onClick={onViewDocument}>
          <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
            <Eye className="size-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">Ver documento</span>
            <span className="text-muted-foreground block text-xs">
              Revisar el contrato y su anexo
            </span>
          </span>
          <ArrowRight
            className="text-muted-foreground group-hover:text-primary size-4 shrink-0"
            aria-hidden="true"
          />
        </button>
        {email ? (
          <a className={actionClass} href={email}>
            <span className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-lg">
              <EnvelopeSimple className="size-5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">Preparar email</span>
              <span className="text-muted-foreground block text-xs">
                Adjunta el PDF manualmente
              </span>
            </span>
            <ArrowSquareOut
              className="text-muted-foreground group-hover:text-primary size-4 shrink-0"
              aria-hidden="true"
            />
          </a>
        ) : (
          <p className="text-muted-foreground px-3 py-2 text-xs">
            Añade un email al cliente para preparar el mensaje.
          </p>
        )}
      </div>
      {contract.signed_at ? (
        <p className="text-muted-foreground mt-3 border-t pt-3 text-xs">
          El PDF generado no incluye la firma.{' '}
          {contract.signed_document_path
            ? 'Consulta el PDF firmado desde las acciones del contrato si tienes permiso.'
            : 'No hay ningún PDF firmado adjunto.'}
        </p>
      ) : null}
    </section>
  )
}
