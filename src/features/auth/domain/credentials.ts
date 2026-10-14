import { z } from 'zod'

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Escribe tu correo.')
  .max(254, 'El correo no puede superar 254 caracteres.')
  .email('Revisa el correo: parece que falta algo, por ejemplo «nombre@empresa.es».')

export const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, 'Escribe tu contraseña.')
    .max(256, 'La contraseña es demasiado larga.'),
})

export const passwordRules = 'Al menos 10 caracteres, con una letra y un número.'

export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(10, 'La contraseña necesita al menos 10 caracteres.')
      .max(256, 'La contraseña no puede superar 256 caracteres.')
      .regex(/[A-Za-z]/, 'Añade al menos una letra.')
      .regex(/\d/, 'Añade al menos un número.'),
    confirm: z.string(),
  })
  .refine((value) => value.password === value.confirm, {
    path: ['confirm'],
    message: 'Las dos contraseñas no coinciden.',
  })

const passwordSchema = z
  .string()
  .min(10, 'La contraseña necesita al menos 10 caracteres.')
  .max(256, 'La contraseña no puede superar 256 caracteres.')
  .regex(/[A-Za-z]/, 'Añade al menos una letra.')
  .regex(/\d/, 'Añade al menos un número.')

export const signupSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Escribe tu nombre.')
    .max(120, 'El nombre es demasiado largo.'),
  companyName: z
    .string()
    .trim()
    .min(1, 'Escribe el nombre de tu empresa.')
    .max(120, 'El nombre de la empresa es demasiado largo.'),
  email: emailSchema,
  password: passwordSchema,
})

/** First validation message, ready to show under a form. */
export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Revisa los datos.'
}
