import type { ReactNode } from 'react'

import type { Tenant } from '@/shared/domain/types'

/** Company and operating defaults, kept as text while being edited. */
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
  defaultVatRate: string
  defaultDepositPercent: string
  autoReminders: string
}

export type FormProps = {
  form: Form
  set: (key: keyof Form) => (value: string) => void
  tenant: Tenant
}

export const hexColor = /^#[0-9a-fA-F]{6}$/
export const defaultBrandColor = '#2a4227'

export const isLogoOk = (logoUrl: string) =>
  logoUrl.trim() === '' || /^https:\/\/\S+$/.test(logoUrl.trim())
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
    defaultVatRate: String(t.defaultVatRate),
    defaultDepositPercent: String(t.defaultDepositPercent),
    autoReminders: t.autoReminders ? 'yes' : 'no',
  }
}

export function percent(value: string, fallback: number) {
  const n = Number(value.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : fallback
}

export const companyFields = [
  'name',
  'legalName',
  'taxId',
  'email',
  'phone',
  'address',
  'postalCode',
  'city',
  'website',
  'iban',
] as const satisfies readonly (keyof Form)[]
export const defaultsFields = [
  'defaultVatRate',
  'defaultDepositPercent',
  'autoReminders',
] as const satisfies readonly (keyof Form)[]

export function companySettingsValid(form: Form) {
  return (
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
    isWebsiteOk(form.website)
  )
}

export function defaultsSettingsValid(form: Form) {
  return [form.defaultVatRate, form.defaultDepositPercent].every((value) => {
    const number = Number(value.replace(',', '.'))
    return value.trim() !== '' && Number.isFinite(number) && number >= 0 && number <= 100
  })
}

export function companySettingsPatch(form: Form) {
  return Object.fromEntries(companyFields.map((key) => [key, form[key].trim()])) as Pick<
    Tenant,
    (typeof companyFields)[number]
  >
}

export function defaultsSettingsPatch(form: Form, tenant: Tenant) {
  return {
    defaultVatRate: percent(form.defaultVatRate, tenant.defaultVatRate),
    defaultDepositPercent: percent(form.defaultDepositPercent, tenant.defaultDepositPercent),
    autoReminders: form.autoReminders === 'yes',
  }
}

export function Section({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: ReactNode
}) {
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
