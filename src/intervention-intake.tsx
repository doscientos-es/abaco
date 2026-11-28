import { useEffect, useRef, useState, type FormEvent } from 'react'
import { createRoot } from 'react-dom/client'

import './intervention-intake.css'

const token = /^#[0-9a-f]{64}$/.test(location.hash) ? location.hash.slice(1) : ''
if (location.hash) history.replaceState(null, '', location.pathname)
const maximumPhotos = 3
const maximumBytes = 2_097_152
const actionErrors: Record<string, string> = {
  unavailable_link: 'Este enlace ya no está disponible. Pide a la empresa un enlace nuevo.',
  try_later:
    'Espera unos segundos antes de reintentar. Si agotaste los intentos, pide un enlace nuevo.',
  invalid_input: 'Revisa la dirección, la disponibilidad y la confirmación.',
  body_too_large: 'Las fotos ocupan demasiado. Elimina una imagen o envía la solicitud sin fotos.',
  invalid_photo:
    'Alguna foto no se puede procesar. Usa JPG, PNG o WebP, o envía la solicitud sin fotos.',
  photo_unavailable: 'No se pueden procesar fotos ahora. Puedes seguir sin adjuntarlas.',
}

async function request(action: 'check' | 'submit', body: unknown, operation?: string) {
  const response = await fetch(`/api/intervention-request/${action}`, {
    method: 'POST',
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
    headers: {
      'content-type': 'application/json',
      'x-request-invitation': token,
      ...(operation ? { 'x-request-operation': operation } : {}),
    },
    body: JSON.stringify(body),
  })
  const value = await response.json()
  if (!response.ok)
    throw new Error(
      actionErrors[value.error] ?? 'No se pudo confirmar. Reintenta sin cerrar esta página.',
    )
  return value
}

function fileBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () =>
      reject(new Error('No se pudo abrir una foto. Quítala para enviar sin ella.'))
    reader.onload = () => {
      const encoded = typeof reader.result === 'string' ? reader.result.split(',')[1] : undefined
      if (!encoded) reject(new Error('No se pudo leer la foto.'))
      else resolve(encoded)
    }
    reader.readAsDataURL(file)
  })
}

function Thumbnail({ file, label }: { file: File; label: string }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    const value = URL.createObjectURL(file)
    // The browser owns this local-only object URL, revoked on removal/navigation.
    // oxlint-disable-next-line react/set-state-in-effect
    setUrl(value)
    return () => URL.revokeObjectURL(value)
  }, [file])
  return url ? (
    <img src={url} alt={label} className="max-h-32 w-full rounded-md object-contain" />
  ) : null
}
function Intake() {
  const [state, setState] = useState<'checking' | 'ready' | 'unavailable' | 'success'>(
    token ? 'checking' : 'unavailable',
  )
  const [address, setAddress] = useState('')
  const [availability, setAvailability] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [checked, setChecked] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState('')
  const operation = useRef<{ signature: string; id: string } | null>(null)
  const processing = useRef(false)
  const valid = address.trim().length >= 3 && availability.trim().length >= 3 && checked

  useEffect(() => {
    if (!token) return
    let current = true
    void request('check', {})
      .then(() => {
        if (current) setState('ready')
      })
      .catch(() => {
        if (current) setState('unavailable')
      })
    return () => {
      current = false
    }
  }, [])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!valid || processing.current) return
    processing.current = true
    setError('')
    setBusy(true)
    try {
      const photos = await Promise.all(files.map(fileBase64))
      const body = {
        address: address.trim(),
        availability: availability.trim(),
        confirm: true,
        photos,
      }
      // Hash only in memory to avoid keeping a duplicate copy of the photo data.
      const signature = Array.from(
        new Uint8Array(
          await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(body))),
        ),
        (octet) => octet.toString(16).padStart(2, '0'),
      ).join('')
      const pendingOperation =
        operation.current?.signature === signature
          ? operation.current
          : { signature, id: crypto.randomUUID() }
      operation.current = pendingOperation
      const response = await request('submit', body, pendingOperation.id)
      if (typeof response.receipt !== 'string')
        throw new Error('No se pudo confirmar la solicitud.')
      setReceipt(response.receipt)
      setAddress('')
      setAvailability('')
      setFiles([])
      setChecked(false)
      setState('success')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo confirmar. Vuelve a intentarlo.')
    } finally {
      processing.current = false
      setBusy(false)
    }
  }

  const inputClass =
    'border-input bg-background block min-h-11 w-full min-w-0 rounded-lg border p-3 text-base focus-visible:outline-2 focus-visible:outline-offset-1'
  const secondary = 'border-border bg-card min-h-11 rounded-md border px-3 py-2 text-sm font-medium'
  return (
    <main className="bg-muted/30 min-h-screen px-3 py-6 sm:py-12">
      <section
        aria-labelledby="title"
        className="bg-card border-border mx-auto max-w-lg space-y-4 rounded-xl border p-4 sm:p-6"
      >
        <p className="text-muted-foreground text-sm font-medium">Menos Líos</p>
        <h1 id="title" className="text-2xl font-semibold">
          Solicitar una intervención
        </h1>
        {state === 'checking' ? <output>Comprobando la invitación…</output> : null}
        {state === 'unavailable' ? (
          <div className="space-y-2">
            <p role="alert">
              No se pudo abrir la invitación. Comprueba la conexión o pide un enlace nuevo a la
              empresa.
            </p>
            {token ? (
              <button
                type="button"
                className={secondary}
                onClick={() => {
                  setState('checking')
                  void request('check', {})
                    .then(() => setState('ready'))
                    .catch(() => setState('unavailable'))
                }}
              >
                Reintentar comprobación
              </button>
            ) : null}
          </div>
        ) : null}
        {state === 'success' ? (
          <section className="space-y-2" aria-label="Solicitud recibida">
            <output className="block font-semibold">Solicitud recibida.</output>
            <p>La empresa la revisará. No se ha reservado ninguna cita.</p>
            <p className="text-muted-foreground text-sm wrap-anywhere">Referencia: {receipt}</p>
          </section>
        ) : null}
        {state === 'ready' ? (
          <form className="space-y-4" onSubmit={(event) => void submit(event)}>
            <p className="text-muted-foreground text-sm">
              Envía una sola solicitud a la empresa que te facilitó este enlace. La revisarán antes
              de acordar una cita.
            </p>
            <fieldset disabled={busy} className="min-w-0 space-y-4">
              <label className="block space-y-1">
                <span className="font-medium">Dirección de la intervención</span>
                <textarea
                  autoComplete="street-address"
                  required
                  minLength={3}
                  maxLength={250}
                  rows={2}
                  className={inputClass}
                  value={address}
                  onChange={(event) => {
                    setAddress(event.target.value)
                    setChecked(false)
                  }}
                />
              </label>
              <label className="block space-y-1">
                <span className="font-medium">Disponibilidad aproximada</span>
                <textarea
                  required
                  minLength={3}
                  maxLength={400}
                  rows={3}
                  className={inputClass}
                  placeholder="Por ejemplo, martes por la mañana"
                  value={availability}
                  onChange={(event) => {
                    setAvailability(event.target.value)
                    setChecked(false)
                  }}
                />
              </label>
              <div className="space-y-2">
                <label className="block space-y-1">
                  <span className="font-medium">Fotos opcionales</span>
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    className={inputClass}
                    onChange={(event) => {
                      const chosen = Array.from(event.target.files ?? [])
                      event.target.value = ''
                      const next = [...files, ...chosen]
                      if (
                        next.length > maximumPhotos ||
                        next.some(
                          (file) =>
                            !file.size ||
                            file.size > maximumBytes ||
                            !['image/jpeg', 'image/png', 'image/webp'].includes(file.type),
                        )
                      ) {
                        setError(
                          'Puedes añadir hasta 3 fotos JPG, PNG o WebP de 2 MB como máximo cada una.',
                        )
                        return
                      }
                      setError('')
                      setFiles(next)
                      setChecked(false)
                    }}
                  />
                </label>
                <p className="text-muted-foreground text-sm">
                  Hasta 3 fotos, 2 MB cada una. Puedes seguir sin fotos. Evita incluir caras,
                  documentos o datos innecesarios.
                </p>
                {files.length ? (
                  <ul className="grid gap-2 sm:grid-cols-3">
                    {files.map((file, index) => (
                      <li
                        key={`${file.name}:${file.lastModified}:${index}`}
                        className="border-border min-w-0 space-y-2 rounded-md border p-2"
                      >
                        <Thumbnail
                          file={file}
                          label={`Vista previa local de la foto ${index + 1}`}
                        />
                        <button
                          type="button"
                          className={secondary}
                          onClick={() => {
                            setFiles((previous) => previous.filter((_, n) => n !== index))
                            setChecked(false)
                            setError('')
                          }}
                        >
                          Quitar foto {index + 1}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <label className="bg-muted flex items-start gap-2 rounded-lg p-3 text-sm">
                <input
                  type="checkbox"
                  className="accent-primary mt-1 size-5 shrink-0"
                  checked={checked}
                  onChange={(event) => setChecked(event.target.checked)}
                />
                <span>
                  Autorizo el envío de la dirección, la disponibilidad y{' '}
                  {files.length
                    ? `${files.length} foto${files.length === 1 ? '' : 's'} seleccionada${files.length === 1 ? '' : 's'}`
                    : 'ninguna foto'}{' '}
                  a la empresa para revisar esta solicitud. Al enviarla, el enlace dejará de admitir
                  otra solicitud. No se reservará una cita.
                </span>
              </label>
            </fieldset>
            {busy ? (
              <output className="block text-sm">
                Enviando datos y comprobando las fotos. No cierres esta pantalla.
              </output>
            ) : null}
            {error ? (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={!valid || busy}
              className="bg-primary text-primary-foreground min-h-11 w-full rounded-md px-3 py-2 font-medium disabled:opacity-50"
            >
              {busy ? 'Enviando…' : 'Enviar una solicitud'}
            </button>
          </form>
        ) : null}
      </section>
    </main>
  )
}
const root = document.getElementById('root')
if (root) createRoot(root).render(<Intake />)
