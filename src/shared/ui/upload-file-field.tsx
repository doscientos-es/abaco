import { Button } from '@doscientos/ui'
import { useId, useState } from 'react'

import { uploadExtension, uploadHint } from '@/shared/domain/upload-file'

export function UploadFileField({
  label,
  file,
  onChange,
  rules,
  disabled = false,
}: {
  label: string
  file: File | null
  onChange: (file: File | null) => void
  rules: Parameters<typeof uploadExtension>[1]
  disabled?: boolean
}) {
  const id = useId()
  const [error, setError] = useState('')
  return (
    <div className="min-w-0 space-y-2">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        type="file"
        accept={Object.keys(rules.types).join(',')}
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
        aria-invalid={!!error}
        disabled={disabled}
        className="border-input file:bg-muted file:text-foreground focus-visible:outline-ring block min-h-11 w-full min-w-0 rounded-md border p-1 text-sm file:mr-2 file:cursor-pointer file:rounded file:border-0 file:px-3 file:py-2 disabled:opacity-50"
        onChange={(event) => {
          const selected = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (!selected) return
          try {
            uploadExtension(selected, rules)
            setError('')
            onChange(selected)
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : 'No se pudo seleccionar el archivo.')
            onChange(null)
          }
        }}
      />
      <p id={`${id}-hint`} className="text-muted-foreground text-xs">
        {uploadHint(rules)}
      </p>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
      {file ? (
        <div className="flex flex-wrap items-center justify-between gap-x-2 text-sm">
          <span className="min-w-0 flex-1 break-all">{file.name}</span>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Quitar archivo seleccionado: ${file.name}`}
            className="min-h-11"
            isDisabled={disabled}
            onPress={() => {
              setError('')
              onChange(null)
            }}
          >
            Quitar
          </Button>
        </div>
      ) : null}
    </div>
  )
}
