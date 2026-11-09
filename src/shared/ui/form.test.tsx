import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { PasswordField } from './form'

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
