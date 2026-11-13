import { Button, Tabs, TabsList, TabsTrigger } from '@doscientos/ui'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'

import { ClientTypesSection } from '@/features/clients'
import { patchTenant } from '@/features/settings/application/settings-actions'
import {
  defaultBrandColor,
  hexColor,
  isLogoOk,
  Section,
} from '@/features/settings/ui/settings-form'
import { StaffFunctionsSection } from '@/features/staff-schedules'
import type { Tenant } from '@/shared/domain/types'
import { useTenantData } from '@/shared/store/store'
import { TextField } from '@/shared/ui/form'
import { WorkspacePageHeading, WorkspacePageTabs } from '@/shared/ui/workspace-page-chrome'

import { MessageFields, type MessageForm } from './message-fields'
import { messageForm, messageFormValid, messagePatch } from './message-form'

const palettes = [
  { name: 'Abaco', color: defaultBrandColor },
  { name: 'Azul', color: '#2563eb' },
  { name: 'Terracota', color: '#c2410c' },
  { name: 'Marino', color: '#1e3a5f' },
  { name: 'Ciruela', color: '#7e22ce' },
]

export function PersonalizationPage() {
  const { tenant } = useTenantData()
  return <PersonalizationContent key={tenant.id} tenant={tenant} />
}

function PersonalizationContent({ tenant }: { tenant: Tenant }) {
  const navigate = useNavigate()
  const tab = useSearch({ from: '/personalizar' }).tab ?? 'marca'
  const [brandColor, setBrandColor] = useState(tenant.brandColor ?? '')
  const [logoUrl, setLogoUrl] = useState(tenant.logoUrl ?? '')
  const [messages, setMessages] = useState(() => messageForm(tenant))
  const [saved, setSaved] = useState(false)
  const color = hexColor.test(brandColor) ? brandColor : defaultBrandColor
  const logoOk = isLogoOk(logoUrl)
  const dirty =
    tab === 'documentos'
      ? JSON.stringify(messages) !== JSON.stringify(messageForm(tenant))
      : brandColor !== (tenant.brandColor ?? '') || logoUrl !== (tenant.logoUrl ?? '')
  const valid =
    tab === 'documentos'
      ? messageFormValid(messages)
      : (brandColor === '' || hexColor.test(brandColor)) && logoUrl.length <= 500 && logoOk

  const setMessage = (key: keyof MessageForm) => (value: string) => {
    setMessages((current) => ({ ...current, [key]: value }))
    setSaved(false)
  }

  function save() {
    if (!valid) return
    patchTenant(
      tab === 'documentos' ? messagePatch(messages) : { brandColor, logoUrl: logoUrl.trim() },
    )
    setSaved(true)
  }

  return (
    <div className="max-w-4xl space-y-6">
      <WorkspacePageHeading title="Personalizar" />

      <WorkspacePageTabs>
        <Tabs
          selectedKey={tab}
          onSelectionChange={(key) => {
            setSaved(false)
            void navigate({
              to: '/personalizar',
              search: { tab: key as 'marca' | 'documentos' | 'listas' },
            })
          }}
        >
          <TabsList aria-label="Secciones de personalización">
            <TabsTrigger id="marca">Identidad</TabsTrigger>
            <TabsTrigger id="documentos">Documentos y correos</TabsTrigger>
            <TabsTrigger id="listas">Listas</TabsTrigger>
          </TabsList>
        </Tabs>
      </WorkspacePageTabs>

      {tab === 'marca' ? (
        <>
          <Section
            title="Identidad de marca"
            description="Elige un color y un logo para reconocer tu empresa dentro de Ábaco y en los documentos para clientes."
          >
            <div className="space-y-4 sm:col-span-2">
              <div>
                <p className="text-sm font-medium">Color principal</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Cambia botones, selecciones y otros detalles de la aplicación.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                {palettes.map((palette) => (
                  <button
                    key={palette.color}
                    type="button"
                    aria-label={`Usar color ${palette.name}`}
                    aria-pressed={color.toLowerCase() === palette.color.toLowerCase()}
                    onClick={() => {
                      setBrandColor(palette.color)
                      setSaved(false)
                    }}
                    className="border-border hover:bg-muted flex items-center gap-2 rounded-full border px-3 py-2 text-sm"
                  >
                    <span
                      className="size-4 rounded-full"
                      style={{ backgroundColor: palette.color }}
                    />
                    {palette.name}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-end gap-4">
                <label className="flex flex-col gap-1.5 text-xs font-medium">
                  Color personalizado
                  <span className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label="Elegir color principal"
                      value={color}
                      onChange={(event) => {
                        setBrandColor(event.target.value)
                        setSaved(false)
                      }}
                      className="border-border h-10 w-12 cursor-pointer rounded-md border bg-transparent p-1"
                    />
                    <input
                      aria-label="Color hexadecimal"
                      value={brandColor}
                      placeholder={defaultBrandColor}
                      maxLength={7}
                      onChange={(event) => {
                        setBrandColor(event.target.value.trim())
                        setSaved(false)
                      }}
                      className="border-border bg-background h-10 w-32 rounded-md border px-3 text-sm"
                    />
                  </span>
                </label>
                {brandColor ? (
                  <Button
                    variant="ghost"
                    onPress={() => {
                      setBrandColor('')
                      setSaved(false)
                    }}
                  >
                    Restaurar color de Ábaco
                  </Button>
                ) : null}
              </div>
              {brandColor && !hexColor.test(brandColor) ? (
                <p className="text-destructive text-xs">
                  Escribe un color hexadecimal como #2A4227.
                </p>
              ) : null}
            </div>

            <TextField
              className="sm:col-span-2"
              label="Logo de la empresa"
              value={logoUrl}
              onChange={(value) => {
                setLogoUrl(value)
                setSaved(false)
              }}
              placeholder="https://tuempresa.es/logo.png"
              maxLength={500}
              helper={
                logoOk
                  ? 'Usa un enlace público HTTPS a una imagen PNG, JPG o SVG.'
                  : 'El enlace debe empezar por https://.'
              }
            />
            {logoOk && logoUrl.trim() ? (
              <div className="border-border flex min-h-24 items-center gap-4 rounded-lg border p-4 sm:col-span-2">
                <img
                  src={logoUrl.trim()}
                  alt={`Logo de ${tenant.name}`}
                  className="max-h-14 max-w-40 object-contain"
                  onError={(event) => {
                    event.currentTarget.hidden = true
                  }}
                />
                <div className="min-w-0">
                  <p className="text-muted-foreground text-xs">Vista previa</p>
                  <p className="font-semibold">{tenant.name}</p>
                </div>
                <Button variant="ghost" className="ml-auto" onPress={() => setLogoUrl('')}>
                  Quitar
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground text-xs sm:col-span-2">
                Sin logo se mostrará el nombre de la empresa.
              </p>
            )}
          </Section>

          <Section
            title="Vista previa"
            description="Comprueba cómo se verá el color principal en la aplicación."
          >
            <div className="border-border flex items-center gap-3 rounded-lg border p-4 sm:col-span-2">
              <span
                className="flex size-11 items-center justify-center overflow-hidden rounded-lg text-sm font-bold"
                style={{ backgroundColor: color, color: '#fff' }}
              >
                {logoOk && logoUrl.trim() ? (
                  <img src={logoUrl.trim()} alt="" className="size-full object-contain" />
                ) : (
                  tenant.name.slice(0, 2).toUpperCase()
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{tenant.name}</p>
                <p className="text-muted-foreground text-xs">Resumen · Presupuestos · Clientes</p>
              </div>
              <span
                className="rounded-md px-3 py-2 text-sm font-medium"
                style={{ backgroundColor: color, color: '#fff' }}
              >
                Acción principal
              </span>
            </div>
          </Section>
        </>
      ) : null}

      {tab === 'documentos' ? (
        <MessageFields form={messages} set={setMessage} companyName={tenant.name} />
      ) : null}
      {tab === 'listas' ? (
        <div className="space-y-4">
          <ClientTypesSection key={tenant.id} tenantId={tenant.id} />
          <StaffFunctionsSection key={tenant.id} tenantId={tenant.id} />
        </div>
      ) : null}

      {tab !== 'listas' ? (
        <div className="flex items-center justify-end gap-3">
          {saved ? (
            <output className="text-muted-foreground text-sm">Cambios guardados</output>
          ) : null}
          <Button isDisabled={!dirty || !valid} onPress={save}>
            Guardar personalización
          </Button>
        </div>
      ) : null}
    </div>
  )
}
