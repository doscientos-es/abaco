import {
  Button,
  PageHeader,
  PageHeaderDescription,
  PageHeaderHeading,
  PageHeaderTitle,
} from '@doscientos/ui'
import { useState, type ReactNode } from 'react'

import { can, useSession } from '@/features/auth'
import { BillingSection } from '@/features/billing'
import doscientosLogo from '@/assets/logo.svg'
import type { Tenant } from '@/shared/domain/types'
import { brand } from '@/shared/lib/brand'
import { useTenantData } from '@/shared/store/store'
import { fieldIcons } from '@/shared/ui/field-icons'
import { SelectField, TextareaField, TextField } from '@/shared/ui/form'

import { patchTenant } from '../application/settings-actions'
import { TeamSection } from './team-section'

type Form = {
  name: string
  legalName: string
  taxId: string
  email: string
  phone: string
  address: string
  postalCode: string
  city: string
  website: string
  iban: string
  brandColor: string
  logoUrl: string
  emailFromName: string
  emailSignature: string
  invoiceEmailIntro: string
  estimateEmailIntro: string
  documentFooter: string
  defaultVatRate: string
  defaultDepositPercent: string
  autoReminders: string
}

const hexColor = /^#[0-9a-fA-F]{6}$/
const defaultBrandColor = '#2a4227'

function toForm(t: Tenant): Form {
  return {
    name: t.name,
    legalName: t.legalName ?? '',
    taxId: t.taxId,
    email: t.email,
    phone: t.phone,
    address: t.address ?? '',
    postalCode: t.postalCode ?? '',
    city: t.city ?? '',
    website: t.website ?? '',
    iban: t.iban ?? '',
    brandColor: t.brandColor ?? '',
    logoUrl: t.logoUrl ?? '',
    emailFromName: t.emailFromName ?? '',
    emailSignature: t.emailSignature ?? '',
    invoiceEmailIntro: t.invoiceEmailIntro ?? '',
    estimateEmailIntro: t.estimateEmailIntro ?? '',
    documentFooter: t.documentFooter ?? '',
    defaultVatRate: String(t.defaultVatRate),
    defaultDepositPercent: String(t.defaultDepositPercent),
    autoReminders: t.autoReminders ? 'yes' : 'no',
  }
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="border-border bg-card rounded-lg border">
      <div className="border-border border-b px-5 py-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="text-muted-foreground text-xs">{description}</p>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-2">{children}</div>
    </section>
  )
}

function percent(value: string, fallback: number) {
  const n = Number(value.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : fallback
}

export function SettingsPage() {
  const { tenant } = useTenantData()
  const session = useSession()
  const [form, setForm] = useState<Form>(() => toForm(tenant))
  const [saved, setSaved] = useState(false)
  const set = (key: keyof Form) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    setSaved(false)
  }
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(tenant))
  const colorOk = form.brandColor === '' || hexColor.test(form.brandColor)
  const logoOk = form.logoUrl.trim() === '' || /^https:\/\/\S+$/.test(form.logoUrl.trim())
  const valid = form.name.trim() !== '' && colorOk && logoOk

  function save() {
    if (!valid) return
    patchTenant({
      name: form.name.trim(),
      legalName: form.legalName.trim(),
      taxId: form.taxId.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      address: form.address.trim(),
      postalCode: form.postalCode.trim(),
      city: form.city.trim(),
      website: form.website.trim(),
      iban: form.iban.trim(),
      brandColor: form.brandColor,
      logoUrl: form.logoUrl.trim(),
      emailFromName: form.emailFromName.trim(),
      emailSignature: form.emailSignature.trim(),
      invoiceEmailIntro: form.invoiceEmailIntro.trim(),
      estimateEmailIntro: form.estimateEmailIntro.trim(),
      documentFooter: form.documentFooter.trim(),
      defaultVatRate: percent(form.defaultVatRate, tenant.defaultVatRate),
      defaultDepositPercent: percent(form.defaultDepositPercent, tenant.defaultDepositPercent),
      autoReminders: form.autoReminders === 'yes',
    })
    setSaved(true)
  }

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader>
        <PageHeaderHeading>
          <PageHeaderTitle>Ajustes</PageHeaderTitle>
          <PageHeaderDescription>
            Los datos de tu empresa. Aparecen en los presupuestos, las facturas y los mensajes que envías.
          </PageHeaderDescription>
        </PageHeaderHeading>
      </PageHeader>

      <Section title="Empresa" description="Cómo te identificas ante tus clientes.">
        <TextField
          label="Nombre comercial"
          placeholder="Reformas Abderrahim"
          icon={fieldIcons.building}
          helper="Obligatorio. Es el nombre que ve el cliente."
          value={form.name}
          onChange={set('name')}
        />
        <TextField
          label="Razón social"
          placeholder="Reformas Abderrahim S.L."
          icon={fieldIcons.building}
          helper="El nombre legal que aparece en las facturas."
          value={form.legalName}
          onChange={set('legalName')}
        />
        <TextField
          label="NIF / CIF"
          placeholder="B12345678"
          icon={fieldIcons.id}
          value={form.taxId}
          onChange={set('taxId')}
        />
        <TextField
          label="Web"
          placeholder="https://tuempresa.es"
          icon={fieldIcons.globe}
          value={form.website}
          onChange={set('website')}
        />
      </Section>

      <Section title="Contacto" description="El teléfono se usa para recibir respuestas por WhatsApp.">
        <TextField
          label="Email"
          type="email"
          placeholder="hola@tuempresa.es"
          icon={fieldIcons.mail}
          value={form.email}
          onChange={set('email')}
        />
        <TextField
          label="Teléfono"
          type="tel"
          placeholder="600 000 000"
          icon={fieldIcons.phone}
          helper="Sin prefijo se asume España (+34)."
          value={form.phone}
          onChange={set('phone')}
        />
      </Section>

      <Section title="Dirección fiscal" description="Se muestra en el documento del presupuesto.">
        <TextField
          className="sm:col-span-2"
          label="Dirección"
          placeholder="C/ Mayor 12, local 2"
          icon={fieldIcons.pin}
          value={form.address}
          onChange={set('address')}
        />
        <TextField
          label="Código postal"
          placeholder="08001"
          value={form.postalCode}
          onChange={set('postalCode')}
        />
        <TextField label="Ciudad" placeholder="Barcelona" value={form.city} onChange={set('city')} />
      </Section>

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
              value={hexColor.test(form.brandColor) ? form.brandColor : defaultBrandColor}
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
        {hexColor.test(form.brandColor) || (logoOk && form.logoUrl.trim()) ? (
          <div
            className="border-border sm:col-span-2 flex items-center gap-4 rounded-md border border-t-4 p-4"
            style={{ borderTopColor: hexColor.test(form.brandColor) ? form.brandColor : defaultBrandColor }}
          >
            {logoOk && form.logoUrl.trim() ? (
              <img src={form.logoUrl.trim()} alt="Vista previa del logo" className="max-h-12 max-w-40 object-contain" />
            ) : null}
            <span
              className="text-lg font-semibold"
              style={{ color: hexColor.test(form.brandColor) ? form.brandColor : undefined }}
            >
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

      <Section title="Cobros y valores por defecto" description="Se aplican a los presupuestos nuevos.">
        <TextField
          className="sm:col-span-2"
          label="IBAN"
          placeholder="ES00 0000 0000 0000 0000 0000"
          icon={fieldIcons.bank}
          helper="Cuenta donde tus clientes te pagan."
          value={form.iban}
          onChange={set('iban')}
        />
        <TextField
          label="IVA por defecto (%)"
          placeholder="10"
          icon={fieldIcons.percent}
          helper="Entre 0 y 100."
          value={form.defaultVatRate}
          onChange={set('defaultVatRate')}
        />
        <TextField
          label="Señal por defecto (%)"
          placeholder="40"
          icon={fieldIcons.percent}
          helper="Primer pago al aceptar el presupuesto."
          value={form.defaultDepositPercent}
          onChange={set('defaultDepositPercent')}
        />
        <SelectField
          className="sm:col-span-2"
          label="Recordatorios por correo: facturas vencidas (cada 7 días, máx. 3) y presupuestos que caducan en 3 días"
          value={form.autoReminders}
          options={[
            { value: 'no', label: 'Desactivados' },
            { value: 'yes', label: 'Activados' },
          ]}
          onChange={set('autoReminders')}
        />
      </Section>

      {session?.tenantId && can(session.role, 'team:manage') ? (
        <TeamSection tenantId={session.tenantId} />
      ) : null}

      {session?.tenantId && session.role === 'owner' ? (
        <BillingSection tenantId={session.tenantId} companyName={tenant.name} />
      ) : null}

      <div className="flex items-center justify-end gap-3">
        {saved ? <p className="text-muted-foreground text-sm">Cambios guardados</p> : null}
        <Button isDisabled={!dirty || !valid} onPress={save}>
          Guardar cambios
        </Button>
      </div>

      <section className="border-border bg-card flex flex-wrap items-center justify-between gap-4 rounded-lg border px-5 py-4">
        <div className="flex items-center gap-4">
          <span className="bg-background border-border flex h-10 w-12 shrink-0 items-center justify-center rounded-lg border shadow-sm">
            <img src="/abaco-logo-short.svg" alt={brand.name} className="h-5 w-auto" />
          </span>
          <div className="leading-tight">
            <h2 className="text-sm font-semibold">Acerca de {brand.name}</h2>
            <p className="text-muted-foreground text-xs">{brand.tagline}</p>
          </div>
        </div>
        <a
          href={brand.makerUrl}
          target="_blank"
          rel="noopener"
          className="text-muted-foreground hover:text-foreground flex items-center gap-2 text-xs transition-colors"
        >
          Un producto de
          <img src={doscientosLogo} alt={brand.maker} className="h-3 w-auto" />
        </a>
      </section>
    </div>
  )
}
