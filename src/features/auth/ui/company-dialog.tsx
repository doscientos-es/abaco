import { useState } from 'react'

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

  async function submit() {
    const result = await create(name)
    if (result.ok) onClose()
    else setError(result.message)
  }

  return (
    <FormDialog
      open
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title="Nueva empresa"
      description="Tendrá sus propios clientes, presupuestos y equipo. Tú serás el propietario."
      submitLabel="Crear empresa"
      submitDisabled={!name.trim()}
      onSubmit={() => void submit()}
    >
      <TextField
        label="Nombre de la empresa"
        className="sm:col-span-2"
        placeholder="Ej. Reformas Abderrahim"
        icon={fieldIcons.user}
        value={name}
        onChange={setName}
      />
      {error ? (
        <output className="text-destructive text-sm sm:col-span-2">{error}</output>
      ) : null}
    </FormDialog>
  )
}
