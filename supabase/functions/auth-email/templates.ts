export type EmailKind =
  | 'signup'
  | 'invite'
  | 'magiclink'
  | 'recovery'
  | 'email_change'
  | 'email'
  | 'reauthentication'

const brand = { name: 'Ábaco', maker: 'Doscientos', makerUrl: 'https://doscientos.es' }

type Template = { subject: string; title: string; intro: string; cta: string; outro: string }

const templates: Record<EmailKind, Template> = {
  recovery: {
    subject: 'Restablece tu contraseña',
    title: 'Restablece tu contraseña',
    intro:
      'Hemos recibido una petición para cambiar tu contraseña. Pulsa el botón para elegir una nueva.',
    cta: 'Elegir nueva contraseña',
    outro:
      'Si no lo has pedido tú, ignora este correo: tu contraseña no cambiará. El enlace caduca en 1 hora.',
  },
  invite: {
    subject: 'Te han invitado a Ábaco',
    title: 'Te han invitado a Ábaco',
    intro:
      'Te han dado acceso a Ábaco, la aplicación de presupuestos de tu empresa. Pulsa el botón para crear tu contraseña y entrar.',
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
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )

export function renderEmail(kind: EmailKind, link: string, code: string) {
  const t = templates[kind] ?? templates.email
  const safeLink = escapeHtml(link)
  // Email clients block SVG, so the logo is a PNG served from the app's public folder.
  const appUrl = (Deno.env.get('APP_URL') ?? 'https://abaco.doscientos.es').replace(/\/$/, '')
  const logoUrl = `${appUrl}/doscientos-logo.png`
  const markUrl = `${appUrl}/abaco-mark.png`
  const font = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif"
  const action =
    kind === 'reauthentication'
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px auto"><tr><td style="background:#f1fbe8;border:1px solid #bdff7b;border-radius:12px;padding:16px 28px;font-size:32px;font-weight:700;letter-spacing:8px;color:#2a4227;font-family:${font}">${escapeHtml(code)}</td></tr></table>`
      : `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0 8px"><tr><td style="background:#2a4227;border-radius:10px"><a href="${safeLink}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:16px;font-weight:600;text-decoration:none;font-family:${font}">${t.cta} &rarr;</a></td></tr></table>
         <p style="color:#6b7280;font-size:12px;line-height:1.5;margin:20px 0 0">¿No funciona el botón? Copia este enlace en tu navegador:<br><a href="${safeLink}" style="color:#2a4227;word-break:break-all">${safeLink}</a></p>`
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"><title>${t.title}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:${font};color:#0f172a">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${t.intro}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9"><tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">
      <tr><td align="center" style="padding:0 0 20px">
        <table role="presentation" cellpadding="0" cellspacing="0"><tr>
          <td style="padding-right:12px"><img src="${markUrl}" width="44" height="44" alt="" style="display:block;border:0;border-radius:11px"></td>
          <td style="font-size:24px;font-weight:700;letter-spacing:-0.5px;color:#0f172a;font-family:${font}">${brand.name}</td>
        </tr></table>
      </td></tr>
      <tr><td style="background:#ffffff;border-radius:16px;border:1px solid #e2e8f0;overflow:hidden">
        <div style="height:4px;background:#2a4227;font-size:0;line-height:0">&nbsp;</div>
        <div style="padding:36px 36px 32px">
          <h1 style="font-size:24px;line-height:1.3;margin:0 0 12px;color:#0f172a;font-weight:700">${t.title}</h1>
          <p style="font-size:16px;line-height:1.6;margin:0;color:#334155">${t.intro}</p>
          ${action}
          <hr style="border:0;border-top:1px solid #e2e8f0;margin:28px 0 16px">
          <p style="color:#64748b;font-size:13px;line-height:1.5;margin:0">${t.outro}</p>
        </div>
      </td></tr>
      <tr><td align="center" style="padding:20px 16px 0;color:#94a3b8;font-size:12px;line-height:1.6">
        <strong style="color:#64748b">${brand.name}</strong> · un producto de<br>
        <a href="${brand.makerUrl}" style="text-decoration:none"><img src="${logoUrl}" width="103" height="16" alt="${brand.maker}" style="display:inline-block;margin:6px 0 10px;border:0;height:16px;width:103px"></a><br>Presupuestos claros, trabajo cerrado.
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`
  const text = `${t.title}\n\n${t.intro}\n\n${kind === 'reauthentication' ? code : link}\n\n${t.outro}\n\n${brand.name} · un producto de ${brand.maker}`
  return { subject: t.subject, html, text }
}
