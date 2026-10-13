import {
  Field,
  FieldTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectList,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@doscientos/ui'
import type { ReactNode } from 'react'

function Helper({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground/80 text-xs font-normal">{children}</span>
}

export function FormField({
  label,
  helper,
  children,
  className,
}: {
  label: string
  helper?: string | undefined
  children: ReactNode
  className?: string | undefined
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      {children}
      {helper ? <Helper>{helper}</Helper> : null}
    </label>
  )
}

/** Text input with a required placeholder, an optional leading icon and helper text. */
export function TextField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  icon,
  helper,
  className,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder: string
  icon?: ReactNode
  helper?: string
  className?: string
}) {
  return (
    <FormField label={label} helper={helper} className={className}>
      <div className="relative">
        {icon ? (
          <span className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3 flex items-center">
            {icon}
          </span>
        ) : null}
        <Input
          type={type}
          value={value}
          placeholder={placeholder}
          className={icon ? 'pl-9' : ''}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </FormField>
  )
}

const NONE_KEY = '__none__'

export type SelectOption = { value: string; label: string }

/** Accessible dropdown built on the design-system Select. An empty-string value is a valid option. */
export function SelectField({
  label,
  hideLabel = false,
  value,
  options,
  onChange,
  placeholder,
  className,
}: {
  label: string
  hideLabel?: boolean
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  const hasEmpty = options.some((option) => option.value === '')
  const selectedKey = value === '' && !hasEmpty ? null : value || NONE_KEY
  const control = (
    <Select
      aria-label={label}
      selectedKey={selectedKey}
      onSelectionChange={(key) => {
        if (key === null) return
        onChange(key === NONE_KEY ? '' : String(key))
      }}
      {...(placeholder ? { placeholder } : {})}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectList>
          {options.map((option) => (
            <SelectItem key={option.value || NONE_KEY} id={option.value || NONE_KEY}>
              {option.label}
            </SelectItem>
          ))}
        </SelectList>
      </SelectContent>
    </Select>
  )
  if (hideLabel) return <div className={className}>{control}</div>
  return (
    <Field className={className}>
      <FieldTitle className="text-muted-foreground text-xs">{label}</FieldTitle>
      {control}
    </Field>
  )
}

export function TextareaField({
  label,
  hideLabel = false,
  value,
  onChange,
  placeholder,
  helper,
  className,
}: {
  label: string
  hideLabel?: boolean
  value: string
  onChange: (value: string) => void
  placeholder: string
  helper?: string
  className?: string
}) {
  const control = (
    <Textarea
      aria-label={label}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  )
  if (hideLabel) return <div className={className}>{control}</div>
  return (
    <Field className={className}>
      <FieldTitle className="text-muted-foreground text-xs">{label}</FieldTitle>
      {control}
      {helper ? <Helper>{helper}</Helper> : null}
    </Field>
  )
}
