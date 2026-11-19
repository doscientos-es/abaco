import type { LedgerEntry } from '@/shared/domain/types'
import { receiptUpload, uploadExtension } from '@/shared/domain/upload-file'
import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

type AttachmentOwner = Pick<LedgerEntry, 'tenantId' | 'id'>
export type PendingLedgerAttachment = { id: string; file: File }
export type LedgerAttachment = { key: string; name: string }

const storage = () => createBrowserSupabaseClient().storage.from('ledger-attachments')
const folder = ({ tenantId, id }: AttachmentOwner) => `${tenantId}/${id}`

export function ledgerAttachmentKey({ id, file }: PendingLedgerAttachment) {
  const extension = uploadExtension(file, receiptUpload)
  const base = file.name
    .replace(/\.[^.]*$/, '')
    .normalize('NFKD')
    .replace(/\p{Mark}/gu, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
  return `${id}_${base || 'justificante'}.${extension}`
}

export async function listLedgerAttachments(entry: AttachmentOwner) {
  const files: LedgerAttachment[] = []
  const limit = 100
  for (let offset = 0; ; offset += limit) {
    const { data, error } = await storage().list(folder(entry), {
      limit,
      offset,
      sortBy: { column: 'name', order: 'asc' },
    })
    if (error) throw new Error('No se pudieron cargar los justificantes.')
    for (const row of data) {
      if (row.id) files.push({ key: row.name, name: row.name.slice(37) })
    }
    if (data.length < limit) return files
  }
}

export async function uploadLedgerAttachment(
  entry: AttachmentOwner,
  pending: PendingLedgerAttachment,
) {
  const key = ledgerAttachmentKey(pending)
  const bucket = storage()
  const path = `${folder(entry)}/${key}`
  const { error } = await bucket.upload(path, pending.file, {
    contentType: pending.file.type,
    upsert: false,
  })
  if (!error) return
  // A retry may find the same immutable file if the first response was lost.
  const { data } = await bucket.exists(path)
  if (!data) throw new Error('No se pudo subir el justificante. Vuelve a intentarlo.')
}

export async function downloadLedgerAttachment(entry: AttachmentOwner, file: LedgerAttachment) {
  const { data, error } = await storage().download(`${folder(entry)}/${file.key}`)
  if (error || !data) throw new Error('No se pudo descargar el justificante.')
  const url = URL.createObjectURL(data)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function removeLedgerAttachment(entry: AttachmentOwner, file: LedgerAttachment) {
  const { data, error } = await storage().remove([`${folder(entry)}/${file.key}`])
  if (error || data.length !== 1) throw new Error('No se pudo eliminar el justificante.')
}
