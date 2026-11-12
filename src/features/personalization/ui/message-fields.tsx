import { Section } from '@/features/settings/ui/settings-form'
import { fieldIcons } from '@/shared/ui/field-icons'
import { TextareaField, TextField } from '@/shared/ui/form'

export type MessageForm = {
  emailFromName: string
  emailSignature: string
  estimateEmailIntro: string
  invoiceEmailIntro: string
  documentFooter: string
}

export function MessageFields({
  form,
  set,
  companyName,
}: {
  form: MessageForm
  set: (key: keyof MessageForm) => (value: string) => void
  companyName: string
}) {
  return (
    <Section
      title="Documentos y correos"
      description="Personaliza lo que reciben tus clientes en presupuestos y facturas."
    >
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
        className="sm:col-span-2"
        label="Mensaje en correos de presupuesto"
        maxLength={1000}
        placeholder="Gracias por contar con nosotros. Cualquier duda, responde a este correo."
        helper="Se añade antes de los datos del presupuesto."
        value={form.estimateEmailIntro}
        onChange={set('estimateEmailIntro')}
      />
      <TextareaField
        className="sm:col-span-2"
        label="Mensaje en correos de factura"
        maxLength={1000}
        placeholder="Adjuntamos tu factura. El pago se realiza por transferencia."
        helper="Se añade antes de los datos de la factura."
        value={form.invoiceEmailIntro}
        onChange={set('invoiceEmailIntro')}
      />
      <TextareaField
        className="sm:col-span-2"
        label="Pie de página de los documentos"
        maxLength={500}
        placeholder="Inscrita en el Registro Mercantil de Barcelona, tomo 1234…"
        helper="Aparece al final de presupuestos y facturas."
        value={form.documentFooter}
        onChange={set('documentFooter')}
      />
    </Section>
  )
}
