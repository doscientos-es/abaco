import { describe, expect, it } from 'vitest'

import type { EstimateStatus } from '@/shared/domain/types'

import {
  estimateCanBeReminded,
  estimateReminderLink,
  estimateReminderMessage,
  estimateReminderPhone,
} from './estimate-reminder'

const today = '2026-11-28'
const pending = { status: 'sent' as const, validUntil: today }

describe('recordatorio de presupuesto', () => {
  it('permite un presupuesto pendiente hasta el último día incluido', () => {
    expect(estimateCanBeReminded(pending, today)).toBe(true)
    expect(estimateCanBeReminded({ ...pending, validUntil: '2026-11-27' }, today)).toBe(false)
    expect(estimateCanBeReminded({ ...pending, validUntil: '' }, today)).toBe(false)
    expect(estimateCanBeReminded({ ...pending, respondedAt: '2026-11-27' }, today)).toBe(false)
  })

  it.each<EstimateStatus>(['draft', 'accepted', 'rejected'])('excluye el estado %s', (status) => {
    expect(estimateCanBeReminded({ ...pending, status }, today)).toBe(false)
  })

  it('conserva el destinatario, referencia, asunto y empresa en el mensaje revisable', () => {
    expect(
      estimateReminderMessage({
        recipient: 'Taller Vélez',
        estimateNumber: 'P-001',
        title: 'Revisión',
        company: 'Servicios Ficción',
      }),
    ).toBe(
      'Hola Taller Vélez,\n\n¿Has podido revisar el presupuesto P-001 para «Revisión»?\n\n' +
        'Puedes consultarlo y responder en el enlace. Si tienes alguna duda, escríbenos.\n\n' +
        'Gracias,\nServicios Ficción',
    )
  })

  it('solo prepara el enlace público existente con un token válido', () => {
    expect(
      estimateReminderLink('https://app.example.test', '00000000-0000-4000-8000-000000000001'),
    ).toBe('https://app.example.test/p/00000000-0000-4000-8000-000000000001')
    expect(() => estimateReminderLink('https://app.example.test', '//otro.example.test')).toThrow(
      'El enlace publicado no está disponible',
    )
  })

  it('muestra el número destinado a WhatsApp y no abre un selector si falta', () => {
    expect(estimateReminderPhone('(612) 345 678')).toBe('+34612345678')
    expect(estimateReminderPhone('0044 7700 900 077')).toBe('+447700900077')
    expect(estimateReminderPhone('')).toBe('')
    expect(estimateReminderPhone('612 345 678 ext. 2')).toBe('')
    expect(estimateReminderPhone('abc')).toBe('')
  })
})
