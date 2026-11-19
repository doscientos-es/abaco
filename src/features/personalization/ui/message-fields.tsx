import type { DocumentKind } from '@/shared/lib/send-document'
import { fieldIcons } from '@/shared/ui/field-icons'
import { TextareaField, TextField } from '@/shared/ui/form'

import type { MessageForm } from './message-form'

export function MessageFields({
  form,
  set,
  companyName,
  kind,
}: {
  form: MessageForm
  set: (key: keyof MessageForm) => (value: string) => void
  companyName: string
  kind: DocumentKind
}) {
  const isEstimate = kind === 'estimate'
  const introKey = isEstimate ? 'estimateEmailIntro' : 'invoiceEmailIntro'
  return (
    <>
      <div>
        <h2 className="font-semibold">
          {isEstimate ? 'Correo de presupuesto' : 'Correo de factura'}
        </h2>
        <p className="text-muted-foreground mt-1 text-xs">
          El mensaje es distinto para cada documento. El remitente y la firma se comparten.
        </p>
      </div>
      <TextField
        label="Nombre del remitente"
        maxLength={80}
        placeholder={companyName}
        icon={fieldIcons.mail}
        helper="Lo que ve el cliente como remitente. Por defecto, tu nombre comercial."
        value={form.emailFromName}
        onChange={set('emailFromName')}
      />
      <TextareaField
        label="Firma del correo"
        maxLength={500}
        placeholder={`Un saludo,\n${companyName}`}
        helper="Cierra todos los correos. Por defecto, tu nombre comercial."
        value={form.emailSignature}
        onChange={set('emailSignature')}
      />
      <TextareaField
        label={isEstimate ? 'Mensaje en correos de presupuesto' : 'Mensaje en correos de factura'}
        maxLength={1000}
        placeholder={
          isEstimate
            ? 'Gracias por contar con nosotros. Cualquier duda, responde a este correo.'
            : 'El pago se realiza por transferencia.'
        }
        helper="Se añade antes de los datos del documento."
        value={form[introKey]}
        onChange={set(introKey)}
      />
    </>
  )
}
