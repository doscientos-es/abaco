import { readFileSync } from 'node:fs'

import { IconButton } from '@doscientos/ui'
import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'

it('applies the pointer cursor to enabled icon buttons and links only', () => {
  const button = renderToStaticMarkup(<IconButton label="Acción">A</IconButton>)
  const link = renderToStaticMarkup(
    <IconButton label="Abrir" href="/clientes">
      A
    </IconButton>,
  )
  const disabled = renderToStaticMarkup(
    <IconButton label="No disponible" isDisabled>
      A
    </IconButton>,
  )
  const css = readFileSync(new URL('../../styles.css', import.meta.url), 'utf8')

  expect(button).toContain('data-slot="icon-button"')
  expect(link).toContain('data-slot="icon-button"')
  expect(disabled).toContain('disabled=""')
  expect(css).toMatch(
    /\[data-slot='icon-button'\]:not\(:disabled\):not\(\[data-disabled\]\):not\(\[aria-disabled='true'\]\)\s*\{\s*cursor:\s*pointer;/,
  )
})
