import { Button, Tabs, TabsList, TabsTrigger } from '@doscientos/ui'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

import { ClientTypesSection } from '@/features/clients'
import { patchTenant } from '@/features/settings/application/settings-actions'
import { isLogoOk } from '@/features/settings/ui/settings-form'
import { StaffFunctionsSection } from '@/features/staff-schedules'
import { defaultEstimateDesign, sameEstimateDesign } from '@/shared/domain/estimate-design'
import { defaultInvoiceDesign } from '@/shared/domain/invoice-design'
import type { Tenant } from '@/shared/domain/types'
import {
  currentTenantData,
  retryStoreSaves,
  useSaveStatus,
  useTenantData,
} from '@/shared/store/store'
import { hexColor } from '@/shared/ui/brand-theme'
import { WorkspacePageHeading, WorkspacePageTabs } from '@/shared/ui/workspace-page-chrome'

import { uploadBrandLogo } from '../application/brand-logo-actions'
import { BrandFields } from './brand-fields'
import { BrandPreview } from './brand-preview'
import { DocumentDesignWorkspace } from './document-design-workspace'
import { EmailWorkspace } from './email-workspace'
import { messageForm, messageFormValid, messagePatch, type MessageForm } from './message-form'
import { PersonalizationWorkspace } from './personalization-workspace'

export function PersonalizationPage() {
  const { tenant } = useTenantData()
  return <PersonalizationContent key={tenant.id} tenant={tenant} />
}

function PersonalizationContent({ tenant }: { tenant: Tenant }) {
  const navigate = useNavigate()
  const tab = useSearch({ from: '/personalizar' }).tab ?? 'marca'
  const [brandColor, setBrandColor] = useState(tenant.brandColor ?? '')
  const [logoUrl, setLogoUrl] = useState(tenant.logoUrl ?? '')
  const [logoDraft, setLogoDraft] = useState<{ file: File; preview: string } | null>(null)
  const [logoUploading, setLogoUploading] = useState(false)
  const [logoUploadError, setLogoUploadError] = useState('')
  const [messages, setMessages] = useState(() => messageForm(tenant))
  const companyDesign = tenant.defaultEstimateDesign ?? defaultEstimateDesign
  const [design, setDesign] = useState(companyDesign)
  const [invoiceDesign, setInvoiceDesign] = useState(
    tenant.defaultInvoiceDesign ?? defaultInvoiceDesign,
  )
  const [saved, setSaved] = useState(false)
  const saveStatus = useSaveStatus()
  const logoOk = isLogoOk(logoUrl)
  const logoPreview = logoDraft?.preview
  useEffect(() => {
    if (logoPreview) return () => URL.revokeObjectURL(logoPreview)
  }, [logoPreview])
  const designChanged = !sameEstimateDesign(design, companyDesign)
  const { documentFooter: _footer, ...emailMessages } = messages
  const { documentFooter: _savedFooter, ...savedEmailMessages } = messageForm(tenant)
  const messagesChanged = JSON.stringify(emailMessages) !== JSON.stringify(savedEmailMessages)
  const footerChanged = messages.documentFooter !== (tenant.documentFooter ?? '')
  const invoiceDesignChanged =
    invoiceDesign !== (tenant.defaultInvoiceDesign ?? defaultInvoiceDesign)
  const dirty =
    tab === 'documentos'
      ? designChanged || invoiceDesignChanged || footerChanged
      : tab === 'correos'
        ? messagesChanged
        : !!logoDraft ||
          brandColor !== (tenant.brandColor ?? '') ||
          logoUrl !== (tenant.logoUrl ?? '')
  const valid =
    tab === 'documentos'
      ? messages.documentFooter.length <= 500
      : tab === 'correos'
        ? messageFormValid(messages)
        : (brandColor === '' || hexColor.test(brandColor)) &&
          (!!logoDraft || (logoUrl.length <= 500 && logoOk))

  const setMessage = (key: keyof MessageForm) => (value: string) => {
    setMessages((current) => ({ ...current, [key]: value }))
    setSaved(false)
  }

  async function saveLogo(file: File) {
    setLogoUploading(true)
    setLogoUploadError('')
    try {
      const url = await uploadBrandLogo(tenant.id, file)
      if (currentTenantData()?.tenant.id !== tenant.id) return
      patchTenant({ brandColor, logoUrl: url })
      setLogoUrl(url)
      setLogoDraft(null)
      setSaved(true)
    } catch (cause) {
      setLogoUploadError(cause instanceof Error ? cause.message : 'No se pudo subir el logo.')
    } finally {
      setLogoUploading(false)
    }
  }

  function save() {
    if (!valid || logoUploading) return
    if (tab === 'marca' && logoDraft) {
      void saveLogo(logoDraft.file)
      return
    }
    patchTenant(
      tab === 'documentos'
        ? {
            ...(footerChanged ? { documentFooter: messages.documentFooter.trim() } : {}),
            ...(designChanged ? { defaultEstimateDesign: design } : {}),
            ...(invoiceDesignChanged ? { defaultInvoiceDesign: invoiceDesign } : {}),
          }
        : tab === 'correos'
          ? messagePatch(messages)
          : { brandColor, logoUrl: logoUrl.trim() },
    )
    setSaved(true)
  }

  const saveActions = (
    <div className="flex flex-wrap items-center justify-end gap-3">
      {saved ? (
        <output className="text-muted-foreground text-sm">
          {saveStatus.state === 'saving'
            ? 'Guardando cambios…'
            : saveStatus.state === 'error'
              ? 'No se pudieron guardar los cambios.'
              : 'Cambios guardados'}
        </output>
      ) : null}
      {saved && saveStatus.state === 'error' ? (
        <Button variant="outline" onPress={retryStoreSaves}>
          Reintentar guardado
        </Button>
      ) : (
        <Button isDisabled={!dirty || !valid || logoUploading} onPress={save}>
          {logoUploading ? 'Subiendo logo…' : 'Guardar personalización'}
        </Button>
      )}
    </div>
  )

  return (
    <div className={tab === 'listas' ? 'max-w-4xl space-y-6' : 'personalization-preview-page'}>
      <WorkspacePageHeading title="Personalizar" />

      <WorkspacePageTabs>
        <Tabs
          selectedKey={tab}
          onSelectionChange={(key) => {
            setSaved(false)
            void navigate({
              to: '/personalizar',
              search: { tab: key as 'marca' | 'documentos' | 'correos' | 'listas' },
            })
          }}
        >
          <TabsList aria-label="Secciones de personalización">
            <TabsTrigger id="marca">Identidad</TabsTrigger>
            <TabsTrigger id="documentos">Documentos</TabsTrigger>
            <TabsTrigger id="correos">Correos</TabsTrigger>
            <TabsTrigger id="listas">Listas</TabsTrigger>
          </TabsList>
        </Tabs>
      </WorkspacePageTabs>

      {tab === 'marca' ? (
        <PersonalizationWorkspace
          previewLabel="Vista previa de la identidad"
          preview={
            <BrandPreview
              companyName={tenant.name}
              color={brandColor}
              logoUrl={logoPreview ?? (logoOk ? logoUrl.trim() : '')}
            />
          }
          controlsLabel="Personalizar identidad"
          controls={
            <BrandFields
              brandColor={brandColor}
              logoUrl={logoUrl}
              logoOk={logoOk}
              logoFile={logoDraft?.file ?? null}
              uploading={logoUploading}
              uploadError={logoUploadError}
              onColorChange={(next) => {
                setBrandColor(next)
                setSaved(false)
              }}
              onLogoChange={(next) => {
                setLogoUrl(next)
                setLogoDraft(null)
                setLogoUploadError('')
                setSaved(false)
              }}
              onLogoFileChange={(file) => {
                setLogoDraft(file ? { file, preview: URL.createObjectURL(file) } : null)
                setLogoUploadError('')
                setSaved(false)
              }}
            />
          }
          saveActions={saveActions}
        />
      ) : null}

      {tab === 'documentos' ? (
        <DocumentDesignWorkspace
          tenant={tenant}
          design={design}
          invoiceDesign={invoiceDesign}
          footer={messages.documentFooter}
          saveActions={saveActions}
          onFooterChange={setMessage('documentFooter')}
          onDesignChange={(next) => {
            setDesign(next)
            setSaved(false)
          }}
          onInvoiceDesignChange={(next) => {
            setInvoiceDesign(next)
            setSaved(false)
          }}
        />
      ) : null}
      {tab === 'correos' ? (
        <EmailWorkspace
          tenant={tenant}
          form={messages}
          set={setMessage}
          saveActions={saveActions}
        />
      ) : null}
      {tab === 'listas' ? (
        <div className="space-y-4">
          <ClientTypesSection key={tenant.id} tenantId={tenant.id} />
          <StaffFunctionsSection key={tenant.id} tenantId={tenant.id} />
        </div>
      ) : null}
    </div>
  )
}
