import type { ReactNode } from 'react'

import { isLogoOk } from '@/features/settings/ui/settings-form'
import type { Tenant } from '@/shared/domain/types'
import type { DocumentKind } from '@/shared/lib/send-document'
import { defaultBrandColor, hexColor } from '@/shared/ui/brand-theme'

import { DocumentTypeTabs } from './document-type-tabs'
import { MessageFields } from './message-fields'
import { messagePatch, type MessageForm } from './message-form'
import { PersonalizationWorkspace } from './personalization-workspace'

export function EmailWorkspace({
  tenant,
  form,
  set,
  saveActions,
}: {
  tenant: Tenant
  form: MessageForm
  set: (key: keyof MessageForm) => (value: string) => void
  saveActions: ReactNode
}) {
  return (
    <DocumentTypeTabs label="Tipo de correo">
      {(kind) => (
        <PersonalizationWorkspace
          previewLabel="Vista previa del correo"
          preview={<EmailPreview tenant={tenant} kind={kind} form={form} />}
          controlsLabel="Personalizar correo"
          controls={<MessageFields form={form} set={set} companyName={tenant.name} kind={kind} />}
          saveActions={saveActions}
        />
      )}
    </DocumentTypeTabs>
  )
}

function EmailPreview({
  tenant,
  kind,
  form,
}: {
  tenant: Tenant
  kind: DocumentKind
  form: MessageForm
}) {
  const { name, brandColor, logoUrl } = tenant
  const draft = messagePatch(form)
  const isEstimate = kind === 'estimate'
  const title = isEstimate ? 'Presupuesto' : 'Factura'
  const intro = isEstimate ? draft.estimateEmailIntro : draft.invoiceEmailIntro
  const color = brandColor && hexColor.test(brandColor) ? brandColor : defaultBrandColor
  const logo = logoUrl && isLogoOk(logoUrl) ? logoUrl.trim() : ''

  return (
    <div className="border-border bg-muted/70 rounded-xl border p-3 sm:p-5">
      <article className="border-border bg-card mx-auto max-w-3xl overflow-hidden rounded-xl border shadow-sm">
        <header className="border-border space-y-3 border-b p-4 sm:p-6">
          <h3 className="text-lg font-semibold wrap-anywhere">
            {title} DEMO-001 · {name}
          </h3>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm wrap-anywhere">
            <dt className="text-muted-foreground">De</dt>
            <dd className="font-medium">{draft.emailFromName || name}</dd>
            <dt className="text-muted-foreground">Para</dt>
            <dd>Cliente de ejemplo</dd>
          </dl>
        </header>
        <div className="p-4 sm:p-6">
          <div
            className="space-y-4 border-t-4 pt-4 text-[15px] leading-relaxed wrap-anywhere"
            style={{ borderColor: color, fontFamily: 'Arial, sans-serif' }}
          >
            {logo ? (
              <img src={logo} alt={name} className="max-h-12 max-w-45 object-contain" />
            ) : null}
            <p>Hola Cliente de ejemplo,</p>
            {intro ? <p className="whitespace-pre-wrap">{intro}</p> : null}
            <p>
              {isEstimate
                ? 'Te enviamos el presupuesto DEMO-001 para «Servicio de mantenimiento».'
                : 'Te enviamos la factura DEMO-001 por «Servicio de mantenimiento».'}
              <br />
              {isEstimate
                ? 'Total: 302,50 € (IVA incluido). Válido hasta 2027-12-19.'
                : 'Importe: 302,50 € (IVA incluido). Vencimiento: 2027-12-19.'}
            </p>
            {isEstimate ? (
              <p>
                Puedes verlo y aceptarlo aquí:{' '}
                <span className="underline">Enlace al presupuesto</span>
              </p>
            ) : null}
            <p>
              {isEstimate
                ? 'Quedamos a tu disposición para cualquier duda.'
                : 'Gracias por confiar en nosotros.'}
              <br />
              <span className="whitespace-pre-wrap">{draft.emailSignature || name}</span>
            </p>
          </div>
        </div>
      </article>
    </div>
  )
}
