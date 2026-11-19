import { describe, expect, it, vi } from 'vitest'

import { planImport } from '@/shared/domain/table-import'
import { readSpreadsheet } from '@/shared/lib/read-spreadsheet'

import { sendTeamInvitations, teamImportSchema } from './team-import'

describe('importación de personas', () => {
  const readCsv = (text: string) => readSpreadsheet(new File([text], 'personas.csv'))

  it('valida roles y correos y omite duplicados sin elevar permisos por defecto', async () => {
    const csv =
      'Correo;Nombre;Rol;DNI;Teléfono\nANA@example.com;Ana;;12345678Z;\nana@example.com;Ana;Administrador;12345678Z;\nbad;X;Usuario;1;\nluis@example.com;Luis;Administrador;2;\nother@example.com;Eva;owner;3;'
    const plan = planImport(await readCsv(csv), teamImportSchema, new Set(['luis@example.com']))
    expect(plan).toEqual({
      valid: [
        { email: 'ana@example.com', fullName: 'Ana', role: 'user', dni: '12345678Z', phone: '' },
      ],
      duplicates: 2,
      errors: [
        { line: 4, message: 'Correo no válido.' },
        { line: 6, message: 'El rol debe ser Usuario o Administrador.' },
      ],
    })
  })

  it('requires a DNI column and rejects rows without a DNI while accepting an empty phone', async () => {
    expect(planImport(await readCsv('Correo\na@example.com'), teamImportSchema, new Set())).toEqual(
      {
        fatal: 'Faltan columnas obligatorias: DNI. La primera fila debe tener las cabeceras.',
      },
    )
    const plan = planImport(
      await readCsv('Correo;DNI;Teléfono\na@example.com; ;\nb@example.com; B123 ;'),
      teamImportSchema,
      new Set(),
    )
    expect(plan).toEqual({
      valid: [{ email: 'b@example.com', fullName: '', role: 'user', dni: 'B123', phone: '' }],
      duplicates: 0,
      errors: [{ line: 2, message: 'El DNI es obligatorio (máximo 40 caracteres).' }],
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
      dni: '12345678Z',
      phone: '',
    }))
    const result = await sendTeamInvitations(invitations, send)
    expect(send).toHaveBeenCalledTimes(2)
    expect(result.completed).toBe(1)
    expect(result.failed?.email).toBe('b')
    expect(result.remaining).toBe(1)
    expect(result.failed?.message).toContain('Revisa el equipo')
  })
})
