import { Button, Tabs, TabsList, TabsTrigger } from '@doscientos/ui'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'

import { can, useSession } from '@/features/auth'
import { BillingSection } from '@/features/billing'
import doscientosLogo from '@/shared/assets/logo.svg'
import type { Tenant } from '@/shared/domain/types'
import { brand } from '@/shared/lib/brand'
import { useTenantData } from '@/shared/store/store'
import { WorkspacePageHeading, WorkspacePageTabs } from '@/shared/ui/workspace-page-chrome'

import { version } from '../../../../package.json'
import { patchTenant } from '../application/settings-actions'
import { ChangelogSection } from './changelog-section'
import { CompanyTab, OperatingDefaultsTab } from './company-tab'
import {
  companyFields,
  companySettingsPatch,
  companySettingsValid,
  defaultsFields,
  defaultsSettingsPatch,
  defaultsSettingsValid,
  toForm,
  type Form,
} from './settings-form'
import { TeamSection } from './team-section'
import { AccountSettings } from './user-settings-page'

export type SettingsTab = 'empresa' | 'operativa' | 'cuenta' | 'equipo' | 'plan' | 'novedades'

const labels: Record<SettingsTab, string> = {
  empresa: 'Empresa',
  operativa: 'Cobros y avisos',
  cuenta: 'Mi cuenta',
  equipo: 'Invitaciones',
  plan: 'Plan y facturación',
  novedades: 'Novedades',
}

export function SettingsPage() {
  const { tenant } = useTenantData()
  return <SettingsContent key={tenant.id} tenant={tenant} />
}

function SettingsContent({ tenant }: { tenant: Tenant }) {
  const session = useSession()
  const navigate = useNavigate()
  const requested = useSearch({ from: '/ajustes' }).tab
  const [form, setForm] = useState<Form>(() => toForm(tenant))
  const [saved, setSaved] = useState(false)

  const canTeam = Boolean(session?.tenantId && can(session.role, 'team:manage'))
  const canPlan = Boolean(session?.tenantId && session.role === 'admin')
  const allowed: SettingsTab[] = ['empresa', 'operativa', 'cuenta']
  if (canTeam) allowed.push('equipo')
  if (canPlan) allowed.push('plan')
  allowed.push('novedades')
  const tab = allowed.find((id) => id === requested) ?? 'empresa'
  const editsCompany = tab === 'empresa' || tab === 'operativa'

  const set = (key: keyof Form) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    setSaved(false)
  }
  const fields = tab === 'operativa' ? defaultsFields : companyFields
  const initial = toForm(tenant)
  const dirty = fields.some((key) => form[key] !== initial[key])
  const valid = tab === 'operativa' ? defaultsSettingsValid(form) : companySettingsValid(form)

  function save() {
    if (!valid) return
    patchTenant(
      tab === 'operativa' ? defaultsSettingsPatch(form, tenant) : companySettingsPatch(form),
    )
    setSaved(true)
  }

  return (
    <div className="max-w-3xl space-y-6">
      <WorkspacePageHeading title="Ajustes" />

      <WorkspacePageTabs>
        <Tabs
          selectedKey={tab}
          onSelectionChange={(key) => {
            setSaved(false)
            void navigate({ to: '/ajustes', search: { tab: key as SettingsTab } })
          }}
        >
          <TabsList aria-label="Secciones de ajustes">
            {allowed.map((id) => (
              <TabsTrigger key={id} id={id}>
                {labels[id]}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </WorkspacePageTabs>

      {tab === 'empresa' ? <CompanyTab form={form} set={set} tenant={tenant} /> : null}
      {tab === 'operativa' ? <OperatingDefaultsTab form={form} set={set} tenant={tenant} /> : null}
      {tab === 'cuenta' ? <AccountSettings /> : null}
      {tab === 'equipo' && session?.tenantId ? (
        <TeamSection tenantId={session.tenantId} mode="invite" />
      ) : null}
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
