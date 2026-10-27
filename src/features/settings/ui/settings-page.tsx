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
import doscientosLogo from '@/shared/assets/logo.svg'
import { brand } from '@/shared/lib/brand'
import { useTenantData } from '@/shared/store/store'

import { version } from '../../../../package.json'
import { patchTenant } from '../application/settings-actions'
import { BrandTab } from './brand-tab'
import { ChangelogSection } from './changelog-section'
import { CompanyTab } from './company-tab'
import { hexColor, isLogoOk, isWebsiteOk, percent, toForm, type Form } from './settings-form'
import { TeamSection } from './team-section'

export type SettingsTab = 'empresa' | 'marca' | 'equipo' | 'plan' | 'novedades'

const labels: Record<SettingsTab, string> = {
  empresa: 'Empresa',
  marca: 'Marca y documentos',
  equipo: 'Equipo',
  plan: 'Plan y facturación',
  novedades: 'Novedades',
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
  allowed.push('novedades')
  const tab = requested && allowed.includes(requested) ? requested : 'empresa'
  const editsCompany = tab === 'empresa' || tab === 'marca'

  const set = (key: keyof Form) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    setSaved(false)
  }
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(tenant))
  const valid =
    form.name.trim() !== '' &&
    form.name.length <= 120 &&
    form.legalName.length <= 160 &&
    form.taxId.length <= 32 &&
    form.email.length <= 254 &&
    (form.email === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) &&
    form.phone.length <= 32 &&
    form.address.length <= 300 &&
    form.postalCode.length <= 20 &&
    form.city.length <= 100 &&
    form.website.length <= 2048 &&
    form.iban.length <= 34 &&
    form.logoUrl.length <= 500 &&
    form.emailFromName.length <= 80 &&
    form.emailSignature.length <= 500 &&
    form.invoiceEmailIntro.length <= 1000 &&
    form.estimateEmailIntro.length <= 1000 &&
    form.documentFooter.length <= 500 &&
    [form.defaultVatRate, form.defaultDepositPercent].every((value) => {
      const number = Number(value.replace(',', '.'))
      return value.trim() !== '' && Number.isFinite(number) && number >= 0 && number <= 100
    }) &&
    (form.brandColor === '' || hexColor.test(form.brandColor)) &&
    isLogoOk(form.logoUrl) &&
    isWebsiteOk(form.website)

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
            Los datos de tu empresa. Aparecen en los presupuestos, las facturas y los mensajes que
            envías.
          </PageHeaderDescription>
        </PageHeaderHeading>
      </PageHeader>

      <Tabs
        selectedKey={tab}
        onSelectionChange={(key) =>
          void navigate({ to: '/ajustes', search: { tab: key as SettingsTab } })
        }
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
      {tab === 'novedades' ? <ChangelogSection /> : null}

      {editsCompany ? (
        <div className="flex items-center justify-end gap-3">
          {saved ? <p className="text-muted-foreground text-sm">Cambios guardados</p> : null}
          <Button isDisabled={!dirty || !valid} onPress={save}>
            Guardar cambios
          </Button>
        </div>
      ) : null}

      <footer className="border-border flex flex-wrap items-center justify-between gap-4 border-t pt-5">
        <div className="flex items-center gap-4">
          <span className="flex h-10 w-12 shrink-0 items-center justify-center">
            <img src="/abaco-logo-short.svg" alt={brand.name} className="h-5 w-auto" />
          </span>
          <div className="leading-tight">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <h2 className="text-sm font-semibold">{brand.name}</h2>
              <span className="text-muted-foreground text-xs">v{version}</span>
            </div>
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
      </footer>
    </div>
  )
}
