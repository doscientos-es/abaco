import { useRef, useState } from 'react'

import { fieldIcons } from '@/shared/ui/field-icons'
import { TextField } from '@/shared/ui/form'
import { FormDialog } from '@/shared/ui/form-dialog'

import { useCompanyActions } from './use-company-actions'

type Props = { open: boolean; onClose: () => void }

/** Creates a new company owned by the current user. */
export function CompanyDialog({ open, onClose }: Props) {
  return open ? <CompanyForm onClose={onClose} /> : null
}

function CompanyForm({ onClose }: Pick<Props, 'onClose'>) {
  const { create } = useCompanyActions()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)

  async function submit() {
    if (submitting.current || !name.trim()) return
    submitting.current = true
    setBusy(true)
    setError('')
    try {
      const result = await create(name)
      if (result.ok) onClose()
      else setError(result.message)
    } catch {
      setError('No pudimos comprobar el alta. Revisa tus empresas antes de volver a intentarlo.')
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  return (
    <FormDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title="Nueva empresa"
      description="Un espacio propio para tu equipo, clientes y trabajos."
      submitLabel={busy ? 'Creando empresa…' : 'Crear empresa'}
      isSubmitting={busy}
      compact
      submitDisabled={!name.trim()}
      onSubmit={() => void submit()}
    >
      <TextField
        label="Nombre de la empresa"
        minLength={1}
        maxLength={120}
        required
        className="sm:col-span-2"
        placeholder="Ej. Instalaciones García"
        icon={fieldIcons.user}
        value={name}
        onChange={setName}
      />
      {error ? (
        <p role="alert" className="text-destructive text-sm sm:col-span-2">
          {error}
        </p>
      ) : null}
    </FormDialog>
  )
}
