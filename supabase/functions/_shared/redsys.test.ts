import { createCipheriv, createHash, createHmac } from 'node:crypto'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { billingOrigin } from './billing-origin'
import {
  chargeReference,
  firstPaymentForm,
  openReference,
  readNotification,
  redsysTerminalMatches,
  sealReference,
  type RedsysConfig,
} from './redsys'

const config: RedsysConfig = {
  currency: '978',
  environment: 'test',
  merchantCode: '999999999',
  secretKey: 'fixture-for-test',
  terminal: '001',
}
const order = '1234A9BC'
const encryptionSecret = 'test-local-reference-key'
const reference = { identifier: 'sandbox-token', cofTxnId: '2006031152000' }
const callback = (overrides: Record<string, string> = {}) => {
  const params = Buffer.from(
    JSON.stringify({
      Ds_Order: order,
      Ds_Response: '0000',
      Ds_Amount: '4598',
      Ds_MerchantCode: config.merchantCode,
      Ds_Terminal: '1',
      Ds_Currency: config.currency,
      Ds_Merchant_Identifier: reference.identifier,
      Ds_Merchant_Cof_Txnid: reference.cofTxnId,
      ...overrides,
    }),
  ).toString('base64url')
  const cipher = createCipheriv('aes-128-cbc', config.secretKey, Buffer.alloc(16))
  const key = Buffer.concat([cipher.update(order, 'utf8'), cipher.final()]).toString('base64')
  const signature = createHmac('sha512', key).update(params).digest('base64url')
  return { params, signature }
}

afterEach(() => vi.unstubAllGlobals())

describe('Redsys subscription provider', () => {
  it('allows only the exact configured application origins', () => {
    const current = 'https://app.menoslios.com'
    const legacy = 'https://abaco.doscientos.es'
    expect(billingOrigin(current, legacy)).toBe(current)
    expect(billingOrigin(legacy, legacy + '/')).toBe(legacy)
    expect(billingOrigin(current + '.example.test', legacy)).toBeNull()
    expect(billingOrigin('http://abaco.doscientos.es', 'http://abaco.doscientos.es')).toBeNull()
  })

  it('prepares an initial sandbox payment requesting a recurring Redsys token', () => {
    const form = firstPaymentForm({
      config,
      order,
      amountCents: 4598,
      notifyUrl: 'https://example.test/notify',
      okUrl: 'https://example.test/ok',
      koUrl: 'https://example.test/ko',
    })
    expect(new URL(form.url).hostname).toBe('sis-t.redsys.es')
    expect(form.signatureVersion).toBe('HMAC_SHA512_V2')
    expect(JSON.parse(Buffer.from(form.merchantParameters, 'base64url').toString())).toMatchObject({
      DS_MERCHANT_COF_INI: 'S',
      DS_MERCHANT_COF_TYPE: 'R',
      DS_MERCHANT_IDENTIFIER: 'REQUIRED',
    })
  })

  it('accepts a signed notification with the terminal in its numeric form', () => {
    const { params, signature } = callback()
    expect(redsysTerminalMatches('1', '001')).toBe(true)
    expect(redsysTerminalMatches('2', '001')).toBe(false)
    expect(redsysTerminalMatches('1a', '001')).toBe(false)
    expect(readNotification(config, params, signature)).toMatchObject(reference)
    expect(readNotification(config, params, 'invalid')).toBeNull()
  })

  it('keeps both provider values encrypted and still reads existing managed references', () => {
    vi.stubGlobal('Deno', { env: { get: () => encryptionSecret } })
    const sealed = sealReference(reference)
    expect(sealed).not.toContain(reference.identifier)
    expect(openReference(sealed)).toEqual(reference)

    const iv = Buffer.alloc(12)
    const cipher = createCipheriv(
      'aes-256-gcm',
      createHash('sha256').update(encryptionSecret).digest(),
      iv,
    )
    const body = Buffer.concat([cipher.update('legacy-test-token', 'utf8'), cipher.final()])
    expect(
      openReference(Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64')),
    ).toEqual({ identifier: 'legacy-test-token' })
  })

  it('includes the original transaction for renewals and rejects mismatched authenticated responses', async () => {
    const result = callback()
    const wrong = callback({ Ds_Amount: '4599' })
    const fetcher = vi.fn<typeof fetch>()
    fetcher.mockImplementationOnce(async (url, init) => {
      expect(new URL(url instanceof Request ? url.url : url).hostname).toBe('sis-t.redsys.es')
      if (typeof init?.body !== 'string') throw new Error('Expected signed JSON request')
      const data = JSON.parse(init.body)
      const fields = JSON.parse(Buffer.from(data.Ds_MerchantParameters, 'base64url').toString())
      expect(fields).toMatchObject({
        DS_MERCHANT_IDENTIFIER: reference.identifier,
        DS_MERCHANT_COF_TXNID: reference.cofTxnId,
        DS_MERCHANT_EXCEP_SCA: 'MIT',
      })
      return Response.json({ Ds_MerchantParameters: result.params, Ds_Signature: result.signature })
    })
    fetcher.mockResolvedValueOnce(
      Response.json({ Ds_MerchantParameters: wrong.params, Ds_Signature: wrong.signature }),
    )
    vi.stubGlobal('fetch', fetcher)
    const args = { config, order, amountCents: 4598, reference }
    await expect(chargeReference(args)).resolves.toEqual({ ok: true, code: '0000' })
    await expect(chargeReference(args)).rejects.toThrow('redsys_unconfirmed_response')
  })
})
