import { z } from 'zod'

import type { Estimate } from '@/shared/domain/types'
import { whatsappNumber } from '@/shared/lib/whatsapp'

export const estimateReminderUnavailable =
  'El recordatorio solo está disponible para un presupuesto enviado, vigente y sin respuesta.'

export function estimateCanBeReminded(
  estimate: Pick<Estimate, 'status' | 'respondedAt' | 'validUntil'>,
  today = new Date().toISOString().slice(0, 10),
) {
  // Match the day boundary on the public estimate page.
  return (
    estimate.status === 'sent' &&
    !estimate.respondedAt &&
    /^\d{4}-\d{2}-\d{2}$/.test(estimate.validUntil) &&
    estimate.validUntil >= today
  )
}

const tokenSchema = z.string().uuid()

export function estimateReminderLink(origin: string, token: string) {
  if (!tokenSchema.safeParse(token).success)
    throw new Error('El enlace publicado no está disponible.')
  return new URL(`/p/${token}`, origin).href
}

export function estimateReminderMessage({
  recipient,
  estimateNumber,
  title,
  company,
}: {
  recipient: string
  estimateNumber: string
  title: string
  company: string
}) {
  return [
    `Hola ${recipient},`,
    `¿Has podido revisar el presupuesto ${estimateNumber} para «${title}»?`,
    'Puedes consultarlo y responder en el enlace. Si tienes alguna duda, escríbenos.',
    `Gracias,\n${company}`,
  ].join('\n\n')
}

export function estimateReminderPhone(phone: string) {
  const trimmed = phone.trim()
  // Don't open the picker or guess the destination when the stored phone isn't usable.
  if (!/^\+?[\d\s().-]+$/.test(trimmed) || trimmed.replace(/\D/g, '').length < 8) return ''
  const number = whatsappNumber(trimmed)
  return /^[1-9]\d{7,14}$/.test(number) ? `+${number}` : ''
}
