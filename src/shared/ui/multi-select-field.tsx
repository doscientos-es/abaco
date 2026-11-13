import { Button, Checkbox, Input, PopoverContent, PopoverTrigger } from '@doscientos/ui'
import { CaretDown, MagnifyingGlass } from '@phosphor-icons/react'
import { useId, useState } from 'react'

import { fuzzySearch } from '../domain/fuzzy-search'
import type { SelectOption } from './form'

/** Searchable multi-selection shared by membership and capability editors. */
export function MultiSelectField({
  label,
  options,
  value,
  onChange,
  isDisabled = false,
  className,
}: {
  label: string
  options: SelectOption[]
  value: string[]
  onChange: (value: string[]) => void
  isDisabled?: boolean
  className?: string
}) {
  const [query, setQuery] = useState('')
  const id = useId()
  const selected = new Set(value)
  const visible = options.filter((option) => fuzzySearch(query, option.label))
  const names = options.filter((option) => selected.has(option.value)).map((option) => option.label)
  return (
    <div className={`min-w-0 space-y-2 ${className ?? ''}`}>
      <span id={id} className="text-muted-foreground block text-xs font-medium">
        {label}
      </span>
      <PopoverTrigger onOpenChange={() => setQuery('')}>
        <Button
          variant="outline"
          isDisabled={isDisabled}
          aria-labelledby={id}
          className="w-full justify-between font-normal"
        >
          <span className="truncate">
            {value.length ? `${value.length} seleccionados` : 'Seleccionar…'}
          </span>
          <CaretDown aria-hidden="true" className="text-muted-foreground size-3.5 shrink-0" />
        </Button>
        <PopoverContent
          placement="bottom start"
          className="w-[min(24rem,calc(100vw-2rem))] p-2"
          aria-label={label}
        >
          <div className="relative mb-2">
            <MagnifyingGlass
              aria-hidden="true"
              className="text-muted-foreground absolute top-3 left-3 size-4"
            />
            <Input
              // oxlint-disable-next-line jsx-a11y/no-autofocus -- Focus the filter only after the user opens this popover.
              autoFocus
              aria-label={`Buscar en ${label.toLocaleLowerCase('es')}`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              maxLength={120}
              placeholder="Buscar…"
              className="pl-9"
            />
          </div>
          <fieldset className="max-h-64 space-y-1 overflow-y-auto" disabled={isDisabled}>
            <legend className="sr-only">{label}</legend>
            {visible.map((option) => (
              <Checkbox
                key={option.value}
                isDisabled={isDisabled}
                isSelected={selected.has(option.value)}
                onChange={(checked) =>
                  onChange(
                    checked
                      ? [...value.filter((id) => id !== option.value), option.value]
                      : value.filter((id) => id !== option.value),
                  )
                }
                className="hover:bg-muted w-full rounded-md px-2 py-2 text-sm"
              >
                {option.label}
              </Checkbox>
            ))}
            {!visible.length ? (
              <p className="text-muted-foreground p-4 text-center text-sm">No hay coincidencias.</p>
            ) : null}
          </fieldset>
          <div className="mt-2 flex items-center justify-between border-t pt-2">
            <output aria-live="polite" className="text-muted-foreground px-2 text-xs">
              {value.length} seleccionados
            </output>
            <Button
              variant="ghost"
              size="sm"
              isDisabled={isDisabled || !value.length}
              onPress={() => onChange([])}
            >
              Limpiar
            </Button>
          </div>
        </PopoverContent>
      </PopoverTrigger>
      {names.length ? (
        <p className="text-muted-foreground truncate text-xs" title={names.join(', ')}>
          {names.slice(0, 3).join(', ')}
          {names.length > 3 ? ` y ${names.length - 3} más` : ''}
        </p>
      ) : null}
    </div>
  )
}
