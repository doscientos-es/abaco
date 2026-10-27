/**
 * Cliente mínimo de Redsys (firma HMAC_SHA512_V2), mismo método que el backoffice.
 * Secretos: REDSYS_MERCHANT_CODE, REDSYS_TERMINAL, REDSYS_SECRET_KEY, REDSYS_ENVIRONMENT (test | prod),
 * REDSYS_CURRENCY (opcional, 978) y REDSYS_REFERENCE_KEY (cifra la referencia de tarjeta guardada).
 */
import { Buffer } from 'node:buffer'
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto'

export type RedsysConfig = {
  currency: string
  environment: 'prod' | 'test'
  merchantCode: string
  secretKey: string
  terminal: string
}

const orderPattern = /^[A-Za-z0-9]{4,12}$/

export function readRedsysConfig(): RedsysConfig | null {
  const environment = Deno.env.get('REDSYS_ENVIRONMENT')?.trim()
  const merchantCode = Deno.env.get('REDSYS_MERCHANT_CODE')?.trim()
  const secretKey = Deno.env.get('REDSYS_SECRET_KEY')?.trim()
  const terminal = Deno.env.get('REDSYS_TERMINAL')?.trim()
  if (
    (environment !== 'test' && environment !== 'prod') ||
    !merchantCode ||
    !secretKey ||
    !terminal
  )
    return null
  return {
    currency: Deno.env.get('REDSYS_CURRENCY')?.trim() || '978',
    environment,
    merchantCode,
    secretKey,
    terminal,
  }
}

/** 4 dígitos + 8 hexadecimales: único por operación y válido para Redsys. */
export function newMerchantOrder(): string {
  return `${randomInt(10_000).toString().padStart(4, '0')}${randomBytes(4).toString('hex').toUpperCase()}`
}

const encode = (value: Record<string, string>) =>
  Buffer.from(JSON.stringify(value)).toString('base64url')

function orderKey(order: string, secretKey: string): string {
  const cipher = createCipheriv(
    'aes-128-cbc',
    Buffer.from(secretKey.slice(0, 16).padEnd(16, '0'), 'utf8'),
    Buffer.alloc(16, 0),
  )
  return Buffer.concat([cipher.update(order, 'utf8'), cipher.final()]).toString('base64')
}

function sign(parameters: string, order: string, secretKey: string): string {
  return createHmac('sha512', orderKey(order, secretKey)).update(parameters).digest('base64url')
}

const baseUrl = (config: RedsysConfig) =>
  config.environment === 'prod' ? 'https://sis.redsys.es/sis' : 'https://sis-t.redsys.es:25443/sis'

/** Formulario de la primera cuota: Redsys pide los datos de la tarjeta y devuelve una referencia para las siguientes. */
export function firstPaymentForm(args: {
  config: RedsysConfig
  order: string
  amountCents: number
  notifyUrl: string
  okUrl: string
  koUrl: string
}) {
  const { config, order } = args
  if (!orderPattern.test(order) || !Number.isInteger(args.amountCents) || args.amountCents <= 0) {
    throw new Error('invalid_redsys_payment')
  }
  const parameters = encode({
    DS_MERCHANT_AMOUNT: String(args.amountCents),
    DS_MERCHANT_CURRENCY: config.currency,
    DS_MERCHANT_MERCHANTCODE: config.merchantCode,
    DS_MERCHANT_MERCHANTURL: args.notifyUrl,
    DS_MERCHANT_ORDER: order,
    DS_MERCHANT_TERMINAL: config.terminal,
    DS_MERCHANT_URLOK: args.okUrl,
    DS_MERCHANT_URLKO: args.koUrl,
    DS_MERCHANT_TRANSACTIONTYPE: '0',
    DS_MERCHANT_IDENTIFIER: 'REQUIRED',
    DS_MERCHANT_COF_INI: 'S',
    DS_MERCHANT_COF_TYPE: 'R',
  })
  return {
    url: `${baseUrl(config)}/realizarPago`,
    signatureVersion: 'HMAC_SHA512_V2',
    merchantParameters: parameters,
    signature: sign(parameters, order, config.secretKey),
  }
}

/** Cuotas siguientes: cobro sin cliente delante, con la referencia guardada. */
export async function chargeReference(args: {
  config: RedsysConfig
  order: string
  amountCents: number
  reference: string
}): Promise<{ ok: boolean; code: string }> {
  const { config, order } = args
  const parameters = encode({
    DS_MERCHANT_ORDER: order,
    DS_MERCHANT_MERCHANTCODE: config.merchantCode,
    DS_MERCHANT_TERMINAL: config.terminal,
    DS_MERCHANT_CURRENCY: config.currency,
    DS_MERCHANT_TRANSACTIONTYPE: '0',
    DS_MERCHANT_AMOUNT: String(args.amountCents),
    DS_MERCHANT_IDENTIFIER: args.reference,
    DS_MERCHANT_COF_TYPE: 'R',
    DS_MERCHANT_EXCEP_SCA: 'MIT',
    DS_MERCHANT_DIRECTPAYMENT: 'true',
  })
  const response = await fetch(`${baseUrl(config)}/rest/trataPeticionREST`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      Ds_SignatureVersion: 'HMAC_SHA512_V2',
      Ds_MerchantParameters: parameters,
      Ds_Signature: sign(parameters, order, config.secretKey),
    }),
    signal: AbortSignal.timeout(50_000),
  })
  if (!response.ok) throw new Error(`redsys_http_${response.status}`)
  const body = (await response.json()) as { Ds_MerchantParameters?: string }
  if (!body.Ds_MerchantParameters) return { ok: false, code: 'sin_respuesta' }
  const decoded = JSON.parse(
    Buffer.from(body.Ds_MerchantParameters, 'base64').toString('utf8'),
  ) as Record<string, unknown>
  const code = typeof decoded.Ds_Response === 'string' ? decoded.Ds_Response : 'sin_codigo'
  return { ok: isSuccess(code), code }
}

export const isSuccess = (code: string) => /^\d{1,4}$/.test(code) && Number(code) <= 99

export type Notification = {
  order: string
  code: string
  amountCents: number
  merchantCode: string
  terminal: string
  currency: string
  identifier?: string
}

/** Comprueba la firma del aviso de Redsys y devuelve sus datos; null si no es válido. */
export function readNotification(
  config: RedsysConfig,
  parameters: string,
  signature: string,
): Notification | null {
  try {
    const d = JSON.parse(Buffer.from(parameters, 'base64').toString('utf8')) as Record<
      string,
      unknown
    >
    const order =
      typeof d.Ds_Order === 'string' ? d.Ds_Order : typeof d.DS_ORDER === 'string' ? d.DS_ORDER : ''
    if (!orderPattern.test(order)) return null
    const expected = Buffer.from(sign(parameters, order, config.secretKey), 'base64url')
    const received = Buffer.from(signature.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
    if (expected.length !== received.length || !timingSafeEqual(expected, received)) return null
    const identifier = d.Ds_Merchant_Identifier
    return {
      order,
      code: typeof d.Ds_Response === 'string' ? d.Ds_Response : '',
      amountCents: Number(d.Ds_Amount),
      merchantCode: typeof d.Ds_MerchantCode === 'string' ? d.Ds_MerchantCode : '',
      terminal: typeof d.Ds_Terminal === 'string' ? d.Ds_Terminal : '',
      currency: typeof d.Ds_Currency === 'string' ? d.Ds_Currency : '',
      identifier:
        typeof identifier === 'string' && identifier.trim() ? identifier.trim() : undefined,
    }
  } catch {
    return null
  }
}

const referenceKey = () => {
  const secret = Deno.env.get('REDSYS_REFERENCE_KEY')?.trim()
  if (!secret) throw new Error('missing_redsys_reference_key')
  return createHash('sha256').update(secret, 'utf8').digest()
}

/** Cifra la referencia de tarjeta antes de guardarla (AES-256-GCM). */
export function sealReference(reference: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', referenceKey(), iv)
  const body = Buffer.concat([cipher.update(reference, 'utf8'), cipher.final()])
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')
}

export function openReference(sealed: string): string {
  const raw = Buffer.from(sealed, 'base64')
  const decipher = createDecipheriv('aes-256-gcm', referenceKey(), raw.subarray(0, 12))
  decipher.setAuthTag(raw.subarray(12, 28))
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8')
}
