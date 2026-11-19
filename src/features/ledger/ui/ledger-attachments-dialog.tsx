import { Button, ConfirmDialog } from '@doscientos/ui'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import type { LedgerEntry } from '@/shared/domain/types'
import { receiptUpload } from '@/shared/domain/upload-file'
import { newId, synchronizeStoreSaves } from '@/shared/store/store'
import { FormDialog } from '@/shared/ui/form-dialog'
import { UploadFileField } from '@/shared/ui/upload-file-field'

import {
  downloadLedgerAttachment,
  listLedgerAttachments,
  removeLedgerAttachment,
  uploadLedgerAttachment,
  type LedgerAttachment,
  type PendingLedgerAttachment,
} from '../application/ledger-attachment-actions'

export function LedgerAttachmentsDialog({
  entry,
  initialFile,
  onClose,
}: {
  entry: LedgerEntry
  initialFile: PendingLedgerAttachment | null
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const queryKey = ['ledger-attachments', entry.tenantId, entry.id]
  const files = useQuery({ queryKey, queryFn: () => listLedgerAttachments(entry), retry: false })
  const [pending, setPending] = useState(initialFile)
  const [toRemove, setToRemove] = useState<LedgerAttachment | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(
    initialFile ? 'No se pudo completar la subida. Puedes reintentar sin añadir otro apunte.' : '',
  )

  async function run(action: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo completar la acción.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <FormDialog
        open
        onOpenChange={(open) => {
          if (!open) onClose()
        }}
        title="Justificantes"
        description={`«${entry.concept}» · Solo los administradores de la empresa tienen acceso.`}
        submitLabel={busy ? 'Procesando…' : 'Subir justificante'}
        submitDisabled={!pending}
        isSubmitting={busy}
        isDirty={!!pending}
        onSubmit={() => {
          if (!pending) return
          void run(async () => {
            await synchronizeStoreSaves()
            await uploadLedgerAttachment(entry, pending)
            setPending(null)
            await queryClient.invalidateQueries({ queryKey })
          })
        }}
      >
        <div className="space-y-4 sm:col-span-2">
          {files.isPending ? <output>Cargando justificantes…</output> : null}
          {files.isError ? (
            <div className="flex flex-wrap items-center gap-2">
              <p role="alert">No se pudieron cargar los justificantes.</p>
              <Button size="sm" variant="outline" onPress={() => void files.refetch()}>
                Volver a cargar
              </Button>
            </div>
          ) : null}
          {files.data?.length === 0 ? (
            <p className="text-muted-foreground text-sm">Aún no hay justificantes.</p>
          ) : null}
          {files.data?.length ? (
            <ul className="divide-border divide-y">
              {files.data.map((file) => (
                <li key={file.key} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="min-w-0 flex-1 text-sm break-words">{file.name}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    aria-label={`Descargar ${file.name}`}
                    isDisabled={busy}
                    onPress={() => void run(() => downloadLedgerAttachment(entry, file))}
                  >
                    Descargar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    aria-label={`Eliminar ${file.name}`}
                    isDisabled={busy}
                    onPress={() => setToRemove(file)}
                  >
                    Eliminar
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          <UploadFileField
            label="Foto, factura o ticket"
            rules={receiptUpload}
            file={pending?.file ?? null}
            disabled={busy}
            onChange={(file) => setPending(file ? { id: newId(), file } : null)}
          />
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
        </div>
      </FormDialog>
      <ConfirmDialog
        open={!!toRemove}
        onOpenChange={(open) => {
          if (!open) setToRemove(null)
        }}
        title="¿Eliminar justificante?"
        description={toRemove ? `«${toRemove.name}» se eliminará definitivamente.` : null}
        confirmLabel="Eliminar"
        destructive
        onConfirm={() => {
          if (!toRemove) return
          const file = toRemove
          setToRemove(null)
          void run(async () => {
            await removeLedgerAttachment(entry, file)
            await queryClient.invalidateQueries({ queryKey })
          })
        }}
      />
    </>
  )
}
