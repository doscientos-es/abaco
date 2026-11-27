import { Button } from '@doscientos/ui'

import { logoUpload } from '@/shared/domain/upload-file'
import { defaultBrandColor, hexColor } from '@/shared/ui/brand-theme'
import { TextField } from '@/shared/ui/form'
import { UploadFileField } from '@/shared/ui/upload-file-field'

const palettes = [
  { name: 'Menos Líos', color: defaultBrandColor },
  { name: 'Azul', color: '#2563eb' },
  { name: 'Terracota', color: '#c2410c' },
  { name: 'Marino', color: '#1e3a5f' },
  { name: 'Ciruela', color: '#7e22ce' },
]

export function BrandFields({
  brandColor,
  logoUrl,
  logoOk,
  logoFile,
  uploading,
  uploadError,
  onColorChange,
  onLogoChange,
  onLogoFileChange,
}: {
  brandColor: string
  logoUrl: string
  logoOk: boolean
  logoFile: File | null
  uploading: boolean
  uploadError: string
  onColorChange: (color: string) => void
  onLogoChange: (url: string) => void
  onLogoFileChange: (file: File | null) => void
}) {
  const validColor = !brandColor || hexColor.test(brandColor)
  const color = validColor && brandColor ? brandColor : defaultBrandColor
  return (
    <>
      <div>
        <h2 className="font-semibold">Identidad de marca</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Personaliza el color y el logo que identifican a tu empresa en Menos Líos y en tus
          documentos.
        </p>
      </div>
      <fieldset disabled={uploading} className="space-y-3">
        <legend className="mb-2 text-sm font-medium">Color principal</legend>
        <div className="flex flex-wrap gap-2">
          {palettes.map((palette) => (
            <button
              key={palette.color}
              type="button"
              aria-label={`Usar color ${palette.name}`}
              aria-pressed={validColor && color.toLowerCase() === palette.color}
              onClick={() => onColorChange(palette.color)}
              className="border-border hover:bg-muted aria-pressed:bg-muted aria-pressed:border-foreground/40 flex items-center gap-2 rounded-full border px-3 py-2 text-xs"
            >
              <span className="size-3.5 rounded-full" style={{ backgroundColor: palette.color }} />
              {palette.name}
            </button>
          ))}
        </div>
        <div className="flex items-start gap-3">
          <label className="text-muted-foreground flex flex-col gap-1.5 text-xs font-medium">
            Color personalizado
            <input
              type="color"
              aria-label="Elegir color principal"
              value={color}
              onChange={(event) => onColorChange(event.target.value)}
              className="border-border h-10 w-12 cursor-pointer rounded-md border bg-transparent p-1"
            />
          </label>
          <TextField
            label="Color hexadecimal"
            className="min-w-0 flex-1"
            value={brandColor}
            placeholder={defaultBrandColor}
            maxLength={7}
            onChange={(value) => onColorChange(value.trim())}
            {...(!validColor ? { helper: 'Escribe un color hexadecimal como #2A4227.' } : {})}
          />
        </div>
        {brandColor ? (
          <Button
            size="sm"
            variant="ghost"
            isDisabled={uploading}
            onPress={() => onColorChange('')}
          >
            Restaurar color de Menos Líos
          </Button>
        ) : null}
      </fieldset>
      <div className="border-border space-y-2 border-t pt-4">
        <UploadFileField
          label="Subir logo de la empresa"
          file={logoFile}
          rules={logoUpload}
          disabled={uploading}
          onChange={onLogoFileChange}
        />
        <p className="text-muted-foreground text-xs">
          El logo se publica al guardar para que pueda verse en los documentos compartidos.
        </p>
        {uploadError ? (
          <p role="alert" className="text-destructive text-sm">
            {uploadError}
          </p>
        ) : null}
        <fieldset disabled={uploading}>
          <TextField
            label="Logo de la empresa"
            value={logoUrl}
            onChange={onLogoChange}
            placeholder="https://tuempresa.es/logo.png"
            maxLength={500}
            helper={
              logoOk
                ? 'También puedes usar un enlace público HTTPS. Sin logo se mostrará el nombre de la empresa.'
                : 'El enlace debe empezar por https://.'
            }
          />
        </fieldset>
        {logoUrl.trim() && !logoFile ? (
          <Button size="sm" variant="ghost" isDisabled={uploading} onPress={() => onLogoChange('')}>
            Quitar logo
          </Button>
        ) : null}
      </div>
    </>
  )
}
