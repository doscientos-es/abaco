import {
  Button,
  PageHeader,
  PageHeaderDescription,
  PageHeaderHeading,
  PageHeaderTitle,
} from '@doscientos/ui'
import { useState, type ReactNode } from 'react'

import type { Tenant } from '@/shared/domain/types'
import { useTenantData } from '@/shared/store/store'
import { fieldIcons } from '@/shared/ui/field-icons'
import { TextField } from '@/shared/ui/form'

import { patchTenant } from '../application/settings-actions'

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
  defaultVatRate: string
  defaultDepositPercent: string
}

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
    defaultVatRate: String(t.defaultVatRate),
    defaultDepositPercent: String(t.defaultDepositPercent),
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
  const [form, setForm] = useState<Form>(() => toForm(tenant))
  const [saved, setSaved] = useState(false)
  const set = (key: keyof Form) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    setSaved(false)
  }
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(tenant))
  const valid = form.name.trim() !== ''

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
      defaultVatRate: percent(form.defaultVatRate, tenant.defaultVatRate),
      defaultDepositPercent: percent(form.defaultDepositPercent, tenant.defaultDepositPercent),
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
      </Section>

      <div className="flex items-center justify-end gap-3">
        {saved ? <p className="text-muted-foreground text-sm">Cambios guardados</p> : null}
        <Button isDisabled={!dirty || !valid} onPress={save}>
          Guardar cambios
        </Button>
      </div>
    </div>
  )
}
