import { fieldIcons } from '@/shared/ui/field-icons'
import { TextareaField, TextField } from '@/shared/ui/form'

import { Section, type FormProps } from './settings-form'

/** Customer-facing document and email branding. */
export function BrandTab({ form, set, tenant }: FormProps) {
  return (
    <Section
      title="Documentos y correos"
      description="Personaliza los mensajes y datos de marca que reciben tus clientes en presupuestos y facturas."
    >
      <TextField
        label="Nombre del remitente"
        maxLength={80}
        placeholder={tenant.name}
        icon={fieldIcons.mail}
        helper="Lo que ve el cliente como remitente del correo. Por defecto, tu nombre comercial."
        value={form.emailFromName}
        onChange={set('emailFromName')}
      />
      <TextareaField
        label="Firma del correo"
        maxLength={500}
        placeholder={`Un saludo,\n${tenant.name}`}
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
