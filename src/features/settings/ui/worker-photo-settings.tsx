import { Button } from '@doscientos/ui'
import { useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'

import {
  saveWorkerAvatar,
  useSession,
  useWorkerAvatar,
  UserAvatar,
  workerAvatarKey,
} from '@/features/auth'

export function WorkerPhotoSettings({ userId, name }: { userId: string; name: string }) {
  const session = useSession()
  const photo = useWorkerAvatar(userId)
  const queryClient = useQueryClient()
  const inputId = useId()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function change(file: File | null) {
    const tenantId = session?.tenantId
    if (!tenantId || busy) return
    setBusy(true)
    setMessage('')
    try {
      await saveWorkerAvatar(tenantId, userId, file)
      setMessage(file ? 'Foto actualizada.' : 'Foto eliminada.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar la foto.')
    } finally {
      await queryClient.invalidateQueries({ queryKey: workerAvatarKey(tenantId, userId) })
      setBusy(false)
    }
  }

  return (
    <section className="space-y-3" aria-label={`Foto de ${name}`}>
      <div className="flex items-center gap-3">
        <UserAvatar
          name={name}
          userId={userId}
          avatarUrl={userId === session?.userId ? session.avatarUrl : null}
          className="size-11 shrink-0"
        />
        <div>
          <p className="text-sm font-medium">Foto de trabajador (opcional)</p>
          <p className="text-muted-foreground text-xs">
            Solo para esta empresa. JPG, PNG o WebP; máximo 2 MB.
          </p>
        </div>
      </div>
      <label htmlFor={inputId} className="block text-sm font-medium">
        Elegir foto
      </label>
      <input
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        disabled={busy}
        className="block max-w-full text-sm"
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (file) void change(file)
        }}
      />
      {photo.data ? (
        <Button variant="outline" isDisabled={busy} onPress={() => void change(null)}>
          Quitar foto
        </Button>
      ) : null}
      {busy ? <output>Guardando foto…</output> : null}
      {message ? <output className="block text-sm">{message}</output> : null}
      {photo.isError ? (
        <p role="alert" className="text-destructive text-sm">
          No se pudo cargar la foto.
        </p>
      ) : null}
    </section>
  )
}
