import { describe, expect, it } from 'vitest'

import { publicEstimateDocument } from './public-estimate-document'

describe('public estimate document projection', () => {
  it('preserves the agreed modular content and uses only live response state', () => {
    const sections = [
      {
        id: 'section',
        type: 'description',
        title: 'Alcance',
        content: 'Publicado',
        pageBreakBefore: true,
      },
    ]
    const published = {
      title: 'Original',
      status: 'sent',
      document_format: 'sections',
      document_design: { layout: 'compact', showIndex: false, showLogo: true, showFooter: false },
      document_sections: sections,
      conversion_destination: 'contract',
      contract_billing_frequency: 'quarterly',
      estimate_lines: [{ id: 'line', description: 'Servicio', details: 'Mantenimiento semanal' }],
    }
    const projected = publicEstimateDocument(published, {
      title: 'Modificado',
      status: 'accepted',
      responded_by: 'Cliente',
      responded_signature: [
        [
          { x: 0.1, y: 0.2 },
          { x: 0.9, y: 0.8 },
        ],
      ],
      document_design: { layout: 'proposal' },
      document_sections: [],
    })
    expect(projected).toMatchObject({
      title: 'Original',
      status: 'accepted',
      responded_by: 'Cliente',
      responded_signature: [
        [
          { x: 0.1, y: 0.2 },
          { x: 0.9, y: 0.8 },
        ],
      ],
      document_format: 'sections',
      document_design: published.document_design,
      document_sections: sections,
      conversion_destination: 'contract',
      contract_billing_frequency: 'quarterly',
      estimate_lines: published.estimate_lines,
    })
  })

  it('keeps old publications on the traditional layout', () => {
    expect(publicEstimateDocument({ title: 'Histórico' }, { status: 'sent' })).toMatchObject({
      document_format: 'table',
      document_design: null,
      document_sections: [],
    })
  })

  it('exposes the captured signature only after acceptance', () => {
    const signature = [
      [
        { x: 0.1, y: 0.2 },
        { x: 0.9, y: 0.8 },
      ],
    ]
    expect(
      publicEstimateDocument({}, { status: 'sent', responded_signature: signature }),
    ).toHaveProperty('responded_signature', null)
    expect(
      publicEstimateDocument({}, { status: 'accepted', responded_signature: signature }),
    ).toHaveProperty('responded_signature', signature)
  })

  it('never exposes tokens or new internal columns by spreading rows', () => {
    const projected = publicEstimateDocument(
      {
        title: 'Oferta',
        public_token: 'private-token',
        internal_notes: 'private-notes',
        email_sent_at: 'private-date',
      },
      { status: 'sent', public_token: 'private-token' },
    )
    expect(JSON.stringify(projected)).not.toContain('private-')
  })
})
