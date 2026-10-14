import {
  Button,
  PageHeader,
  PageHeaderDescription,
  PageHeaderHeading,
  PageHeaderTitle,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@doscientos/ui'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'

import { can, useSession } from '@/features/auth'
import { BillingSection } from '@/features/billing'
import doscientosLogo from '@/assets/logo.svg'
import { brand } from '@/shared/lib/brand'
import { useTenantData } from '@/shared/store/store'

import { patchTenant } from '../application/settings-actions'

import { BrandTab } from './brand-tab'
import { CompanyTab } from './company-tab'
import { hexColor, isLogoOk, percent, toForm, type Form } from './settings-form'
import { TeamSection } from './team-section'

export type SettingsTab = 'empresa' | 'marca' | 'equipo' | 'plan'

const labels: Record<SettingsTab, string> = {
  empresa: 'Empresa',
  marca: 'Marca y documentos',
  equipo: 'Equipo',
  plan: 'Plan y facturación',
}

export function SettingsPage() {
  const { tenant } = useTenantData()
  const session = useSession()
  const navigate = useNavigate()
  const requested = useSearch({ from: '/ajustes' }).tab
  const [form, setForm] = useState<Form>(() => toForm(tenant))
  const [saved, setSaved] = useState(false)

  const canTeam = Boolean(session?.tenantId && can(session.role, 'team:manage'))
  const canPlan = Boolean(session?.tenantId && session.role === 'owner')
  const allowed: SettingsTab[] = ['empresa', 'marca']
  if (canTeam) allowed.push('equipo')
  if (canPlan) allowed.push('plan')
  const tab = requested && allowed.includes(requested) ? requested : 'empresa'
  const editsCompany = tab === 'empresa' || tab === 'marca'

  const set = (key: keyof Form) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    setSaved(false)
  }
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(tenant))
  const valid =
    form.name.trim() !== '' && (form.brandColor === '' || hexColor.test(form.brandColor)) && isLogoOk(form.logoUrl)

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
      weeklySummary: form.weeklySummary === 'yes',
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

      <Tabs
        selectedKey={tab}
        onSelectionChange={(key) => void navigate({ to: '/ajustes', search: { tab: key as SettingsTab } })}
      >
        <TabsList aria-label="Secciones de ajustes" className="w-full overflow-x-auto sm:w-fit">
          {allowed.map((id) => (
            <TabsTrigger key={id} id={id}>
              {labels[id]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {tab === 'empresa' ? <CompanyTab form={form} set={set} tenant={tenant} /> : null}
      {tab === 'marca' ? <BrandTab form={form} set={set} tenant={tenant} /> : null}
      {tab === 'equipo' && session?.tenantId ? <TeamSection tenantId={session.tenantId} /> : null}
      {tab === 'plan' && session?.tenantId ? (
        <BillingSection tenantId={session.tenantId} companyName={tenant.name} />
      ) : null}

      {editsCompany ? (
        <div className="flex items-center justify-end gap-3">
          {saved ? <p className="text-muted-foreground text-sm">Cambios guardados</p> : null}
          <Button isDisabled={!dirty || !valid} onPress={save}>
            Guardar cambios
          </Button>
        </div>
      ) : null}

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