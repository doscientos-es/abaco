import { Button } from '@doscientos/ui'

import {
  documentAccent,
  type DocumentAppearance,
  type documentLogoPositions,
  type documentLogoSizes,
} from '@/shared/domain/document-appearance'

import { SelectField } from './form'

const sizes = {
  standard: 'Del diseño',
  small: 'Pequeño',
  large: 'Grande',
} satisfies Record<(typeof documentLogoSizes)[number], string>

const positions = {
  auto: 'Del diseño',
  left: 'Izquierda',
  center: 'Centro',
  right: 'Derecha',
} satisfies Record<(typeof documentLogoPositions)[number], string>

export function DocumentAppearanceFields({
  value,
  onChange,
  brandColor,
  showLogo,
}: {
  value: DocumentAppearance
  onChange: (appearance: DocumentAppearance) => void
  brandColor?: string | undefined
  showLogo: boolean
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-2 text-sm font-medium">Apariencia</legend>
      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label="Tamaño del logo"
          value={value.logoSize}
          isDisabled={!showLogo}
          options={Object.entries(sizes).map(([value, label]) => ({ value, label }))}
          onChange={(logoSize) => onChange({ ...value, logoSize: logoSize as keyof typeof sizes })}
        />
        <SelectField
          label="Posición del logo"
          value={value.logoPosition}
          isDisabled={!showLogo}
          options={Object.entries(positions).map(([value, label]) => ({ value, label }))}
          onChange={(logoPosition) =>
            onChange({ ...value, logoPosition: logoPosition as keyof typeof positions })
          }
        />
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-muted-foreground flex flex-col gap-1.5 text-xs font-medium">
          Color de acento
          <input
            type="color"
            value={documentAccent(value.accentColor) ?? documentAccent(brandColor) ?? '#2a4227'}
            onChange={(event) => onChange({ ...value, accentColor: event.currentTarget.value })}
            className="border-border h-9 w-14 cursor-pointer rounded-md border bg-transparent p-1"
          />
        </label>
        {value.accentColor ? (
          <Button size="sm" variant="ghost" onPress={() => onChange({ ...value, accentColor: '' })}>
            Usar color de la empresa
          </Button>
        ) : null}
      </div>
    </fieldset>
  )
}
