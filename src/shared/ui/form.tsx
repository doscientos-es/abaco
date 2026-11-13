import {
  Field,
  FieldLabel,
  FieldTitle,
  Button,
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  Input,
  PasswordInput,
  Select,
  SelectContent,
  SelectItem,
  SelectList,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@doscientos/ui'
import { useId, type ReactNode } from 'react'

import { fuzzySearch } from '../domain/fuzzy-search'

function Helper({ children }: { children: ReactNode }) {
  return <span className="text-muted-foreground/80 text-xs font-normal">{children}</span>
}

export function FormField({
  label,
  helper,
  helperId,
  required = false,
  children,
  className,
}: {
  label: string
  helper?: string | undefined
  helperId?: string | undefined
  required?: boolean
  children: ReactNode
  className?: string | undefined
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <span className="text-muted-foreground text-xs font-medium">
        {label}
        {required ? (
          <span aria-hidden="true" title="Obligatorio">
            {' '}
            *
          </span>
        ) : null}
      </span>
      {children}
      {helper ? (
        <span id={helperId}>
          <Helper>{helper}</Helper>
        </span>
      ) : null}
    </label>
  )
}

/** Text input with a required placeholder, an optional leading icon and helper text. */
export function TextField({
  label,
  value,
  onChange,
  onBlur,
  type = 'text',
  placeholder,
  icon,
  helper,
  className,
  name,
  autoComplete,
  maxLength,
  minLength,
  required = false,
  showCount = false,
  min,
  max,
  step,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  onBlur?: () => void
  type?: string
  placeholder: string
  icon?: ReactNode
  helper?: string
  className?: string
  name?: string
  autoComplete?: string
  maxLength?: number
  minLength?: number
  required?: boolean
  showCount?: boolean
  min?: number | string
  max?: number | string
  step?: number | string
}) {
  const helperId = useId()
  const countId = useId()
  const hasCount = showCount && maxLength !== undefined
  const describedBy =
    [helper ? helperId : null, hasCount ? countId : null].filter(Boolean).join(' ') || undefined

  return (
    <FormField
      label={label}
      helper={helper}
      helperId={helperId}
      required={required}
      className={className}
    >
      <div className="relative">
        {icon ? (
          <span className="text-muted-foreground pointer-events-none absolute inset-y-0 left-3 flex items-center">
            {icon}
          </span>
        ) : null}
        <Input
          type={type}
          aria-label={label}
          aria-required={required || undefined}
          aria-describedby={describedBy}
          name={name}
          autoComplete={autoComplete}
          value={value}
          placeholder={placeholder}
          {...(maxLength === undefined ? {} : { maxLength })}
          {...(minLength === undefined ? {} : { minLength })}
          {...(min === undefined ? {} : { min })}
          {...(max === undefined ? {} : { max })}
          {...(step === undefined ? {} : { step })}
          className={icon ? 'pl-9' : ''}
          {...(hasCount ? { style: { paddingRight: '5rem' } } : {})}
          onChange={(event) => onChange(event.target.value)}
          onBlur={onBlur}
        />
        {hasCount ? (
          <>
            <span
              aria-hidden="true"
              className="text-muted-foreground pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs tabular-nums"
            >
              {value.length} / {maxLength}
            </span>
            <span id={countId} className="sr-only">
              {value.length} de {maxLength} caracteres.
            </span>
          </>
        ) : null}
      </div>
    </FormField>
  )
}

/** Password input with an explicit label, visibility toggle and optional helper text. */
export function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  helper,
  className,
  name,
  autoComplete,
  maxLength,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder: string
  helper?: string
  className?: string
  name?: string
  autoComplete?: string
  maxLength?: number
}) {
  const id = useId()
  return (
    <Field className={`gap-1.5 ${className ?? ''}`}>
      <FieldLabel htmlFor={id} className="text-muted-foreground text-xs font-medium">
        {label}
      </FieldLabel>
      <PasswordInput
        id={id}
        name={name}
        autoComplete={autoComplete}
        maxLength={maxLength}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {helper ? <Helper>{helper}</Helper> : null}
    </Field>
  )
}

const NONE_KEY = '__none__'

export type SelectOption = { value: string; label: string }

/** Accessible dropdown built on the design-system Select. An empty-string value is a valid option. */
export function SelectField({
  label,
  hideLabel = false,
  isDisabled = false,
  value,
  options,
  onChange,
  placeholder,
  className,
  searchable,
}: {
  label: string
  hideLabel?: boolean
  isDisabled?: boolean
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  searchable?: boolean
}) {
  const hasEmpty = options.some((option) => option.value === '')
  const selectedKey = value === '' && !hasEmpty ? null : value || NONE_KEY
  const control =
    (searchable ?? options.length >= 8) ? (
      <Combobox
        aria-label={label}
        isDisabled={isDisabled}
        selectedKey={selectedKey}
        defaultFilter={(text, query) => fuzzySearch(query, text)}
        menuTrigger="focus"
        onSelectionChange={(key) => {
          if (key !== null) onChange(key === NONE_KEY ? '' : String(key))
        }}
      >
        <div className="relative">
          <ComboboxInput placeholder={placeholder ?? 'Seleccionar o buscar…'} className="pr-10" />
          <Button
            variant="ghost"
            aria-label={`Mostrar opciones de ${label.toLocaleLowerCase('es')}`}
            className="absolute top-0 right-0 h-full w-9 px-0"
          >
            ⌄
          </Button>
        </div>
        <ComboboxContent>
          <ComboboxList
            emptyState={<p className="text-muted-foreground p-3 text-sm">No hay coincidencias.</p>}
          >
            {options.map((option) => (
              <ComboboxItem
                key={option.value || NONE_KEY}
                id={option.value || NONE_KEY}
                textValue={option.label}
              >
                {option.label}
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    ) : (
      <Select
        aria-label={label}
        isDisabled={isDisabled}
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
  maxLength,
  minLength,
}: {
  label: string
  hideLabel?: boolean
  value: string
  onChange: (value: string) => void
  placeholder: string
  helper?: string
  className?: string
  maxLength?: number
  minLength?: number
}) {
  const control = (
    <Textarea
      aria-label={label}
      value={value}
      placeholder={placeholder}
      {...(maxLength === undefined ? {} : { maxLength })}
      {...(minLength === undefined ? {} : { minLength })}
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
