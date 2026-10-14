import { Button } from '@doscientos/ui'

import { fieldIcons } from '@/shared/ui/field-icons'
import { TextareaField, TextField } from '@/shared/ui/form'

import { defaultBrandColor, hexColor, isLogoOk, Section, type FormProps } from './settings-form'

/** How estimates, invoices and emails look. Empty fields fall back to the default look. */
export function BrandTab({ form, set, tenant }: FormProps) {
  const colorOk = form.brandColor === '' || hexColor.test(form.brandColor)
  const logoOk = isLogoOk(form.logoUrl)
  const color = hexColor.test(form.brandColor) ? form.brandColor : undefined

  return (
    <Section
      title="Marca y personalización"
      description="Cómo se ven tus presupuestos, facturas y correos. Si lo dejas vacío, se usa el aspecto por defecto."
    >
      <div className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-xs">Color de marca</span>
        <div className="flex items-center gap-3">
          <input
            type="color"
            aria-label="Elegir color de marca"
            value={color ?? defaultBrandColor}
            onChange={(event) => set('brandColor')(event.target.value)}
            className="border-border h-9 w-12 cursor-pointer rounded-md border bg-transparent p-1"
          />
          <input
            aria-label="Color en hexadecimal"
            placeholder={defaultBrandColor}
            value={form.brandColor}
            onChange={(event) => set('brandColor')(event.target.value.trim())}
            className="border-border bg-background h-9 w-32 rounded-md border px-3 text-sm"
          />
          {form.brandColor ? (
            <Button variant="ghost" onPress={() => set('brandColor')('')}>
              Quitar
            </Button>
          ) : null}
        </div>
        <span className={colorOk ? 'text-muted-foreground/80 text-xs' : 'text-destructive text-xs'}>
          {colorOk ? 'Se usa en el nombre del documento y en la barra superior del correo.' : 'Usa el formato #RRGGBB.'}
        </span>
      </div>
      <TextField
        label="Logo (enlace)"
        placeholder="https://tuempresa.es/logo.png"
        icon={fieldIcons.globe}
        helper={logoOk ? 'Enlace público que empiece por https://. Mejor PNG o JPG.' : 'Debe empezar por https://'}
        value={form.logoUrl}
        onChange={set('logoUrl')}
      />
      {color || (logoOk && form.logoUrl.trim()) ? (
        <div
          className="border-border flex items-center gap-4 rounded-md border border-t-4 p-4 sm:col-span-2"
          style={{ borderTopColor: color ?? defaultBrandColor }}
        >
          {logoOk && form.logoUrl.trim() ? (
            <img src={form.logoUrl.trim()} alt="Vista previa del logo" className="max-h-12 max-w-40 object-contain" />
          ) : null}
          <span className="text-lg font-semibold" style={{ color }}>
            {form.name || tenant.name}
          </span>
        </div>
      ) : null}
      <TextField
        label="Nombre del remitente"
        placeholder={tenant.name}
        icon={fieldIcons.mail}
        helper="Lo que ve el cliente como remitente del correo. Por defecto, tu nombre comercial."
        value={form.emailFromName}
        onChange={set('emailFromName')}
      />
      <TextareaField
        label="Firma del correo"
        placeholder={`Un saludo,\n${tenant.name}`}
        helper="Cierra todos los correos. Por defecto, tu nombre comercial."
        value={form.emailSignature}
        onChange={set('emailSignature')}
      />
      <TextareaField
        className="sm:col-span-2"
        label="Mensaje en correos de presupuesto"
        placeholder="Gracias por contar con nosotros. Cualquier duda, responde a este correo."
        helper="Se añade antes de los datos del presupuesto."
        value={form.estimateEmailIntro}
        onChange={set('estimateEmailIntro')}
      />
      <TextareaField
        className="sm:col-span-2"
        label="Mensaje en correos de factura"
        placeholder="Adjuntamos tu factura. El pago se realiza por transferencia."
        helper="Se añade antes de los datos de la factura."
        value={form.invoiceEmailIntro}
        onChange={set('invoiceEmailIntro')}
      />
      <TextareaField
        className="sm:col-span-2"
        label="Pie de página de los documentos"
        placeholder="Inscrita en el Registro Mercantil de Barcelona, tomo 1234…"
        helper="Aparece al final de presupuestos y facturas."
        value={form.documentFooter}
        onChange={set('documentFooter')}
      />
    </Section>
  )
}
