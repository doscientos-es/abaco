import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { PasswordField, SelectField, TextField } from './form'

describe('TextField', () => {
  const render = (value: string) =>
    renderToStaticMarkup(
      <TextField
        label="Título"
        placeholder="Título"
        value={value}
        onChange={() => undefined}
        maxLength={200}
        required
        showCount
        helper="Describe el servicio."
      />,
    )

  it('marks required fields accessibly and updates the character count with the value', () => {
    const empty = render('')
    const filled = render('Limpieza')

    expect(empty).toContain('title="Obligatorio"')
    expect(empty).toContain('aria-required="true"')
    expect(empty).toContain('maxLength="200"')
    expect(empty).toContain('padding-right:5rem')
    expect(empty).toContain('0 de 200 caracteres.')
    expect(filled).toContain('8 de 200 caracteres.')
    expect(filled).toContain('8 / 200')

    const describedBy = filled.match(/aria-describedby="([^"]+)"/)?.[1]?.split(' ') ?? []
    expect(describedBy).toHaveLength(2)
    for (const id of describedBy) expect(filled).toContain(`id="${id}"`)
    expect(filled).toContain('Describe el servicio.')
  })

  it('does not mark optional fields or display an unrequested counter', () => {
    const html = renderToStaticMarkup(
      <TextField
        label="Referencia"
        placeholder="Referencia"
        value="abc"
        maxLength={20}
        onChange={() => undefined}
      />,
    )
    expect(html).not.toContain('aria-required=')
    expect(html).not.toContain('caracteres.')
  })
})

describe('PasswordField', () => {
  it('associates its label and exposes the password visibility action', () => {
    const html = renderToStaticMarkup(
      <PasswordField
        label="Contraseña"
        name="password"
        autoComplete="new-password"
        placeholder="Elige una contraseña"
        value=""
        onChange={() => undefined}
      />,
    )

    const labelFor = html.match(/<label[^>]*for="([^"]+)"/)?.[1]
    expect(labelFor).toBeTruthy()
    expect(html).toContain(`id="${labelFor}"`)
    expect(html).toContain('type="password"')
    expect(html).toContain('autoComplete="new-password"')
    expect(html).toContain('aria-label="Mostrar contraseña"')
  })
})

describe('SelectField', () => {
  const options = Array.from({ length: 12 }, (_, i) => ({ value: `${i}`, label: `Persona ${i}` }))

  it('uses a searchable accessible combobox for large lists without losing the selected label', () => {
    const html = renderToStaticMarkup(
      <SelectField label="Responsable" value="8" options={options} onChange={() => undefined} />,
    )
    expect(html).toContain('role="combobox"')
    expect(html).toContain('aria-label="Responsable"')
    expect(html).toContain('value="Persona 8"')
  })

  it('keeps short lists as selects and can explicitly enable or disable search', () => {
    const render = (searchable?: boolean) =>
      renderToStaticMarkup(
        <SelectField
          label="Tipo"
          value="0"
          options={options.slice(0, 2)}
          onChange={() => undefined}
          {...(searchable === undefined ? {} : { searchable })}
        />,
      )
    expect(render()).toContain('data-slot="select-trigger"')
    expect(render(true)).toContain('role="combobox"')
    expect(render(false)).not.toContain('role="combobox"')
  })

  it('supports a selected empty value and disabled search controls', () => {
    const html = renderToStaticMarkup(
      <SelectField
        label="Equipo"
        value=""
        options={[{ value: '', label: 'Sin equipo' }]}
        searchable
        isDisabled
        onChange={() => undefined}
      />,
    )
    expect(html).toContain('value="Sin equipo"')
    expect(html).toContain('disabled')
  })
})
