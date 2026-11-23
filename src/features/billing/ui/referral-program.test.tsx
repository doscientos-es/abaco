import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'

import { ReferralProgram } from './referral-program'

describe('ReferralProgram', () => {
  it('does not promise credits or show a fabricated balance when the program is unavailable', () => {
    const html = renderToStaticMarkup(
      <ReferralProgram summary={null} isPending={false} isError={false} onRetry={vi.fn()} />,
    )
    expect(html).toContain('El programa de referidos aún no está disponible.')
    expect(html).not.toContain('10 %')
    expect(html).not.toContain('Saldo disponible')
  })
})
