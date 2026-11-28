type WorklistOption<T extends string> = {
  value: T
  label: string
  detail: string
}

export function WorklistFilters<T extends string>({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string
  options: ReadonlyArray<WorklistOption<T>>
  selected: T
  onSelect: (next: T) => void
}) {
  return (
    <fieldset className="grid min-w-0 grid-cols-3 gap-1.5 sm:max-w-2xl sm:gap-3">
      <legend className="sr-only">{label}</legend>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={selected === option.value}
          onClick={() => onSelect(option.value)}
          className="border-border bg-card hover:bg-muted focus-visible:ring-ring aria-pressed:border-primary aria-pressed:bg-primary/10 min-h-16 min-w-0 rounded-xl border px-2 py-2.5 text-left focus-visible:ring-2 focus-visible:outline-none sm:px-4"
        >
          <span className="block text-xs leading-tight font-semibold sm:text-sm">
            {option.label}
          </span>
          <span className="text-muted-foreground mt-1 block text-xs tabular-nums">
            {option.detail}
          </span>
        </button>
      ))}
    </fieldset>
  )
}
