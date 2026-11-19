import { useId, type ReactNode } from 'react'

type VisualOption<Value extends string> = {
  value: Value
  label: string
  description: string
  illustration: ReactNode
}

export function VisualRadioGroup<Value extends string>({
  label,
  value,
  options,
  onChange,
  className,
  compact = false,
}: {
  label: string
  value: Value
  options: readonly VisualOption<Value>[]
  onChange: (value: Value) => void
  className?: string
  compact?: boolean
}) {
  const id = useId()

  return (
    <fieldset className={className ?? 'min-w-0'}>
      <legend className="text-muted-foreground mb-2 text-xs font-medium">{label}</legend>
      <div className={compact ? 'grid grid-cols-2 gap-2' : 'grid gap-3 sm:grid-cols-2'}>
        {options.map((option) => {
          const key = `${id}-${option.value}`
          const selected = value === option.value
          return (
            <label key={option.value} className="relative min-w-0 cursor-pointer">
              <input
                type="radio"
                name={id}
                value={option.value}
                checked={selected}
                onChange={() => onChange(option.value)}
                aria-labelledby={`${key}-label`}
                aria-describedby={`${key}-description`}
                className="peer sr-only"
              />
              <span className="border-border bg-card peer-checked:border-primary peer-checked:ring-primary/20 peer-focus-visible:ring-ring hover:border-primary/50 block h-full overflow-hidden rounded-xl border peer-checked:ring-2 peer-focus-visible:ring-2 peer-focus-visible:ring-offset-2">
                <span className="border-border bg-muted/40 block border-b p-3">
                  {option.illustration}
                </span>
                <span className={compact ? 'block space-y-1 p-2.5' : 'block space-y-1 p-3'}>
                  <span
                    id={`${key}-label`}
                    className="flex items-center justify-between gap-1.5 text-sm font-semibold"
                  >
                    {option.label}
                    <span
                      aria-hidden="true"
                      className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-primary bg-primary' : 'border-border'}`}
                    >
                      {selected ? (
                        <span className="bg-primary-foreground size-1.5 rounded-full" />
                      ) : null}
                    </span>
                  </span>
                  <span
                    id={`${key}-description`}
                    className="text-muted-foreground block text-xs leading-relaxed"
                  >
                    {option.description}
                  </span>
                </span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
