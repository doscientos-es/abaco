import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import type { Tenant } from '@/shared/domain/types'

import { CompanyTab, OperatingDefaultsTab } from './company-tab'
import type { Form } from './settings-form'

vi.mock('@/shared/ui/form', () => ({
  TextField: ({ label }: { label: string }) => <span>{label}</span>,
  SelectField: ({ label }: { label: string }) => <span>{label}</span>,
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
  defaultVatRate: '21',
  defaultDepositPercent: '0',
  autoReminders: 'no',
}

describe('company settings tabs', () => {
  it('shows company fields without the retired privacy setting', () => {
    const html = renderToStaticMarkup(
      <CompanyTab form={form} set={() => vi.fn()} tenant={{} as Tenant} />,
    )

    expect(html).toContain('Nombre comercial')
    expect(html).toContain('Contacto')
    expect(html).toContain('Dirección fiscal')
    expect(html).toContain('Cobros')
    expect(html).not.toContain('Recordatorios por correo')
    expect(html).not.toContain('Resumen semanal')
    expect(html).not.toContain('Ubicación al iniciar visitas')
  })

  it('keeps operational defaults and real reminder options in a separate section', () => {
    const html = renderToStaticMarkup(
      <OperatingDefaultsTab form={form} set={() => vi.fn()} tenant={{} as Tenant} />,
    )
    expect(html).toContain('IVA por defecto')
    expect(html).toContain('Señal por defecto')
    expect(html).toContain('Recordatorios por correo')
    expect(html).not.toContain('Nombre comercial')
  })
})
