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
    expect(html).not.toContain('Descuento disponible')
  })

  it('shows attribution without promising discounts that are not active', () => {
    const html = renderToStaticMarkup(
      <ReferralProgram
        summary={{
          code: 'AB12CD34EF56AB78',
          referred_count: 1,
          recommended_by: 'Empresa Norte',
          rewards_active: false,
        }}
        isPending={false}
        isError={false}
        onRetry={vi.fn()}
      />,
    )
    expect(html).toContain('descuentos pendientes')
    expect(html).toContain('no se aplican a los cobros ni a las facturas')
    expect(html).toContain('Empresa Norte')
    expect(html).not.toContain('Descuento disponible')
  })
})
