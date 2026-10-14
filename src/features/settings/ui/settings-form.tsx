import type { ReactNode } from 'react'

import type { Tenant } from '@/shared/domain/types'

/** Every editable company field, as text, shared by the "Empresa" and "Marca" tabs. */
export type Form = {
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
  weeklySummary: string
}

export type FormProps = {
  form: Form
  set: (key: keyof Form) => (value: string) => void
  tenant: Tenant
}

export const hexColor = /^#[0-9a-fA-F]{6}$/
export const defaultBrandColor = '#2a4227'

export const isLogoOk = (logoUrl: string) => logoUrl.trim() === '' || /^https:\/\/\S+$/.test(logoUrl.trim())
export const isWebsiteOk = (website: string) =>
  website.trim() === '' || /^https?:\/\/[^\s./]+(?:\.[^\s/]+)+(?:\/[^\s]*)?$/i.test(website.trim())

export function toForm(t: Tenant): Form {
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
    weeklySummary: t.weeklySummary === false ? 'no' : 'yes',
  }
}

export function percent(value: string, fallback: number) {
  const n = Number(value.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : fallback
}

export function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
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
