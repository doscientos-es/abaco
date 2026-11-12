import { describe, expect, it } from 'vitest'

import type { Tenant } from '@/shared/domain/types'

import {
  companySettingsPatch,
  companySettingsValid,
  defaultsSettingsPatch,
  defaultsSettingsValid,
  toForm,
} from './settings-form'

const tenant: Tenant = {
  id: 'one',
  name: 'Empresa',
  taxId: '',
  email: '',
  phone: '',
  defaultVatRate: 21,
  defaultDepositPercent: 0,
  nextEstimateNumber: 1,
  brandColor: '#112233',
  emailFromName: 'Marca',
  autoReminders: false,
}

describe('settings sections', () => {
  it('updates only company details, without overwriting brand, messages or operating defaults', () => {
    const form = { ...toForm(tenant), name: ' Nueva empresa ' }
    expect(companySettingsValid(form)).toBe(true)
    const patch = companySettingsPatch(form)
    expect(patch.name).toBe('Nueva empresa')
    expect(patch).not.toHaveProperty('brandColor')
    expect(patch).not.toHaveProperty('emailFromName')
    expect(patch).not.toHaveProperty('autoReminders')
  })

  it('validates and saves operational defaults independently of company details', () => {
    const form = {
      ...toForm(tenant),
      name: '',
      defaultVatRate: '10,5',
      defaultDepositPercent: '30',
      autoReminders: 'yes',
    }
    expect(companySettingsValid(form)).toBe(false)
    expect(defaultsSettingsValid(form)).toBe(true)
    expect(defaultsSettingsPatch(form, tenant)).toEqual({
      defaultVatRate: 10.5,
      defaultDepositPercent: 30,
      autoReminders: true,
    })
    expect(defaultsSettingsValid({ ...form, defaultVatRate: '101' })).toBe(false)
  })
})
