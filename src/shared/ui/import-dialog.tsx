import {
  Button,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle,
  Spinner,
  toast,
} from '@doscientos/ui'
import { useRef, useState } from 'react'

import { downloadTextFile } from '@/shared/domain/csv'
import {
  buildAiPrompt,
  buildTemplateCsv,
  planImport,
  type ImportPlan,
  type ImportSchema,
} from '@/shared/domain/table-import'
import { readSpreadsheet } from '@/shared/lib/read-spreadsheet'

type Props<T> = {
  open: boolean
  onClose: () => void
  schema: ImportSchema<T>
  existingKeys: Set<string>
  onImport: (values: T[]) => void
}

/** Import dialog shared by Clientes, Catálogo and Contabilidad. Nothing is saved until the user confirms. */
export function ImportDialog<T>({ open, onClose, schema, existingKeys, onImport }: Props<T>) {
  const [plan, setPlan] = useState<ImportPlan<T> | null>(null)
  const [fileName, setFileName] = useState('')
  const [reading, setReading] = useState(false)
  const [importError, setImportError] = useState('')
  const readVersion = useRef(0)

  function close() {
    readVersion.current += 1
    setPlan(null)
    setFileName('')
    setReading(false)
    setImportError('')
    onClose()
  }

  async function pick(file: File | undefined) {
    if (!file) return
    const version = ++readVersion.current
    setPlan(null)
    setImportError('')
    setFileName(file.name)
    setReading(true)
    try {
      const rows = await readSpreadsheet(file)
      if (version === readVersion.current) setPlan(planImport(rows, schema, existingKeys))
    } catch (error) {
      if (version === readVersion.current)
        setPlan({ fatal: error instanceof Error ? error.message : 'No se pudo leer el archivo.' })
    } finally {
      if (version === readVersion.current) setReading(false)
    }
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(buildAiPrompt(schema))
      toast.success('Prompt copiado', { description: 'Pégalo en ChatGPT y adjunta tu Excel.' })
    } catch {
      toast.error('No se pudo copiar', {
        description: 'Tu navegador ha bloqueado el portapapeles.',
      })
    }
  }

  const valid = plan && 'valid' in plan ? plan.valid : []

  return (
    <DialogRoot open={open} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent className="app-dialog w-full">
        <DialogHeader className="pr-8">
          <DialogTitle>Importar {schema.plural}</DialogTitle>
          <DialogDescription>
            Sube un Excel (.xlsx) o CSV con las cabeceras en la primera fila. Si el formato no
            coincide, no se importa nada.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <input
            type="file"
            accept=".xlsx,.csv,.txt"
            aria-label="Archivo a importar"
            onChange={(event) => {
              void pick(event.target.files?.[0])
              event.target.value = ''
            }}
            className="border-border file:bg-secondary file:text-secondary-foreground block w-full rounded-md border text-sm file:mr-3 file:border-0 file:px-3 file:py-2"
          />
          <p className="text-muted-foreground text-xs">
            Columnas: {schema.columns.map((c) => `${c.label}${c.required ? '*' : ''}`).join(', ')}{' '}
            (* obligatorias).
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onPress={() =>
                downloadTextFile(
                  `plantilla-${schema.plural.split(' ')[0]}.csv`,
                  buildTemplateCsv(schema),
                )
              }
            >
              Descargar plantilla
            </Button>
            <Button size="sm" variant="outline" onPress={() => void copyPrompt()}>
              Copiar prompt para ChatGPT
            </Button>
          </div>

          {reading ? (
            <output className="bg-muted/50 flex items-center gap-3 rounded-lg p-3 text-sm">
              <Spinner aria-hidden="true" label="" size="sm" />
              <span className="min-w-0 break-words">Leyendo {fileName}…</span>
            </output>
          ) : null}
          {plan && 'fatal' in plan ? (
            <div
              role="alert"
              className="border-destructive/40 bg-destructive/10 space-y-2 rounded-md border p-3 text-sm"
            >
              <p className="font-medium">No se ha importado nada</p>
              <p>{plan.fatal}</p>
              <p className="text-muted-foreground">
                Copia el prompt, pégalo en ChatGPT con tu Excel adjunto y sube el archivo que te
                devuelva.
              </p>
            </div>
          ) : null}
          {plan && 'valid' in plan ? (
            <div className="space-y-2 rounded-md border p-3 text-sm" aria-live="polite">
              <p className="font-medium">
                {plan.valid.length}{' '}
                {plan.valid.length === 1 ? 'registro listo' : 'registros listos'} para importar
                {plan.duplicates > 0 ? ` · ${plan.duplicates} ya existentes (se omiten)` : ''}
                {plan.errors.length > 0 ? ` · ${plan.errors.length} con errores (se omiten)` : ''}
              </p>
              {plan.errors.length > 0 ? (
                <ul className="text-muted-foreground max-h-32 list-disc space-y-1 overflow-auto pl-5 text-xs">
                  {plan.errors.slice(0, 50).map((e) => (
                    <li key={e.line}>
                      Fila {e.line}: {e.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
          {importError ? (
            <p role="alert" className="text-destructive text-sm">
              {importError}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <DialogClose variant="outline">Cancelar</DialogClose>
          <Button
            isDisabled={reading || valid.length === 0}
            onPress={() => {
              if (reading || valid.length === 0) return
              try {
                onImport(valid)
                toast.info(
                  `${valid.length} ${valid.length === 1 ? 'registro añadido' : 'registros añadidos'} a la lista`,
                  {
                    description: 'Comprueba el estado de guardado antes de salir.',
                  },
                )
                close()
              } catch (error) {
                setImportError(
                  error instanceof Error ? error.message : 'No se pudo iniciar la importación.',
                )
              }
            }}
          >
            Importar {valid.length > 0 ? valid.length : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  )
}
