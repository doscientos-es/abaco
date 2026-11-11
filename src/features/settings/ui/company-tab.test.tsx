import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { Tenant } from '@/shared/domain/types'

import { CompanyTab } from './company-tab'
import type { Form } from './settings-form'

const { selects } = vi.hoisted(() => ({ selects: new Map<string, (value: string) => void>() }))

vi.mock('@/shared/ui/form', () => ({
  TextField: ({ label }: { label: string }) => <span>{label}</span>,
  SelectField: ({ label, onChange }: { label: string; onChange: (value: string) => void }) => {
    selects.set(label, onChange)
    return <span>{label}</span>
  },
}))

const form: Form = {
  name: 'Empresa',
  legalName: '',
  taxId: '',
  email: '',
  phone: '',
  address: '',
  postalCode: '',
  city: '',
  website: '',
  iban: '',
  brandColor: '',
  logoUrl: '',
  emailFromName: '',
  emailSignature: '',
  invoiceEmailIntro: '',
  estimateEmailIntro: '',
  documentFooter: '',
  defaultVatRate: '21',
  defaultDepositPercent: '0',
  autoReminders: 'no',
  weeklySummary: 'yes',
  collectVisitStartLocation: 'no',
}

describe('company settings tabs', () => {
  it('shows only privacy settings and connects the location choice to its field', () => {
    const change = vi.fn()
    const set = vi.fn(() => change)
    const html = renderToStaticMarkup(
      <CompanyTab form={form} set={set} tenant={{} as Tenant} privacyOnly />,
    )

    expect(html).toContain('Ubicación al iniciar visitas')
    expect(html).toContain('no se hace seguimiento continuo')
    expect(html).not.toContain('Contacto')
    expect(html).not.toContain('Dirección fiscal')
    expect(html).not.toContain('Cobros y valores por defecto')
    expect(set).toHaveBeenCalledOnce()
    expect(set).toHaveBeenCalledWith('collectVisitStartLocation')
    selects.get('Ubicación al iniciar visitas')?.('yes')
    expect(change).toHaveBeenCalledWith('yes')
  })

  it('keeps company fields out of privacy settings and vice versa', () => {
    const html = renderToStaticMarkup(
      <CompanyTab form={form} set={() => vi.fn()} tenant={{} as Tenant} />,
    )

    expect(html).toContain('Nombre comercial')
    expect(html).toContain('Contacto')
    expect(html).toContain('Dirección fiscal')
    expect(html).toContain('Cobros y valores por defecto')
    expect(html).not.toContain('Ubicación al iniciar visitas')
  })
})
