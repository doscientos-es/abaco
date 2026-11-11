import { describe, expect, it, vi } from 'vitest'

import { parseDelimited, planImport } from '@/shared/domain/table-import'

import { sendTeamInvitations, teamImportSchema } from './team-import'

describe('importación de personas', () => {
  it('valida roles y correos y omite duplicados sin elevar permisos por defecto', () => {
    const csv =
      'Correo;Nombre;Rol\nANA@example.com;Ana;\nana@example.com;Ana;Administrador\nbad;X;Usuario\nluis@example.com;Luis;Administrador\nother@example.com;Eva;owner'
    const plan = planImport(parseDelimited(csv), teamImportSchema, new Set(['luis@example.com']))
    expect(plan).toEqual({
      valid: [{ email: 'ana@example.com', fullName: 'Ana', role: 'user' }],
      duplicates: 2,
      errors: [
        { line: 4, message: 'Correo no válido.' },
        { line: 6, message: 'El rol debe ser Usuario o Administrador.' },
      ],
    })
  })

  it('detiene el envío tras un fallo sin volver a enviar los anteriores', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error('network'))
    const invitations = ['a', 'b', 'c'].map((email) => ({
      email,
      fullName: '',
      role: 'user' as const,
    }))
    const result = await sendTeamInvitations(invitations, send)
    expect(send).toHaveBeenCalledTimes(2)
    expect(result.completed).toBe(1)
    expect(result.failed?.email).toBe('b')
    expect(result.remaining).toBe(1)
    expect(result.failed?.message).toContain('Revisa el equipo')
  })
})
