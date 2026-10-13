export type EmailKind = 'signup' | 'invite' | 'magiclink' | 'recovery' | 'email_change' | 'email' | 'reauthentication'

type Template = { subject: string; title: string; intro: string; cta: string; outro: string }

const templates: Record<EmailKind, Template> = {
  recovery: {
    subject: 'Restablece tu contraseña',
    title: 'Restablece tu contraseña',
    intro: 'Hemos recibido una petición para cambiar tu contraseña. Pulsa el botón para elegir una nueva.',
    cta: 'Elegir nueva contraseña',
    outro: 'Si no lo has pedido tú, ignora este correo: tu contraseña no cambiará. El enlace caduca en 1 hora.',
  },
  invite: {
    subject: 'Te han invitado a Presupuestos',
    title: 'Te han invitado',
    intro: 'Te han dado acceso a la aplicación de presupuestos de tu empresa. Pulsa el botón para crear tu contraseña y entrar.',
    cta: 'Aceptar invitación',
    outro: 'Si no esperabas esta invitación, puedes ignorar este correo.',
  },
  signup: {
    subject: 'Confirma tu correo',
    title: 'Confirma tu correo',
    intro: 'Pulsa el botón para confirmar tu dirección de correo y activar tu cuenta.',
    cta: 'Confirmar correo',
    outro: 'Si no has creado una cuenta, ignora este correo.',
  },
  magiclink: {
    subject: 'Tu enlace para entrar',
    title: 'Entra sin contraseña',
    intro: 'Pulsa el botón para entrar. Solo funciona una vez.',
    cta: 'Entrar',
    outro: 'Si no lo has pedido tú, ignora este correo.',
  },
  email_change: {
    subject: 'Confirma tu nuevo correo',
    title: 'Confirma tu nuevo correo',
    intro: 'Pulsa el botón para confirmar el cambio de tu dirección de correo.',
    cta: 'Confirmar cambio',
    outro: 'Si no has pedido este cambio, ignora este correo y cambia tu contraseña.',
  },
  email: {
    subject: 'Confirma tu acceso',
    title: 'Confirma tu acceso',
    intro: 'Pulsa el botón para continuar.',
    cta: 'Continuar',
    outro: 'Si no lo has pedido tú, ignora este correo.',
  },
  reauthentication: {
    subject: 'Tu código de verificación',
    title: 'Tu código de verificación',
    intro: 'Usa este código para confirmar que eres tú:',
    cta: '',
    outro: 'Si no lo has pedido tú, cambia tu contraseña.',
  },
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c)

export function renderEmail(kind: EmailKind, link: string, code: string) {
  const t = templates[kind] ?? templates.email
  const safeLink = escapeHtml(link)
  const action =
    kind === 'reauthentication'
      ? `<p style="font-size:28px;font-weight:700;letter-spacing:6px;margin:24px 0">${escapeHtml(code)}</p>`
      : `<p style="margin:24px 0"><a href="${safeLink}" style="background:#111827;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">${t.cta}</a></p>
         <p style="color:#6b7280;font-size:12px">Si el botón no funciona, copia este enlace en el navegador:<br><span style="word-break:break-all">${safeLink}</span></p>`
  const html = `<!doctype html><html lang="es"><body style="margin:0;background:#f3f4f6;font-family:system-ui,sans-serif;color:#111827">
  <div style="max-width:480px;margin:32px auto;background:#fff;border-radius:12px;padding:32px">
    <h1 style="font-size:20px;margin:0 0 12px">${t.title}</h1>
    <p style="line-height:1.5;margin:0">${t.intro}</p>
    ${action}
    <p style="color:#6b7280;font-size:12px;line-height:1.5;margin:24px 0 0">${t.outro}</p>
  </div></body></html>`
  const text = `${t.title}\n\n${t.intro}\n\n${kind === 'reauthentication' ? code : link}\n\n${t.outro}`
  return { subject: t.subject, html, text }
}
