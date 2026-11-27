import { WarningCircle } from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { sessionQuery } from '../application/auth-actions'
import { finishGoogleAuth } from '../application/google-auth'
import { LoginLayout } from './login-layout'

export function GoogleCallbackPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const started = useRef(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    const params = new URLSearchParams(window.location.search)
    const codes = params.getAll('code')
    window.history.replaceState(window.history.state, '', window.location.pathname)
    if (codes.length !== 1 || params.has('error')) {
      setFailed(true)
      return
    }
    void finishGoogleAuth(codes[0] ?? '')
      .then(async (target) => {
        await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey })
        await navigate({ href: target, replace: true })
      })
      .catch(async () => {
        await queryClient.invalidateQueries({ queryKey: sessionQuery.queryKey })
        setFailed(true)
      })
  }, [navigate, queryClient])

  return (
    <LoginLayout>
      <div className="rounded-3xl border border-[#e1e9de] bg-white px-6 py-10 text-center shadow-[0_16px_48px_-28px_rgba(32,59,43,0.3)] sm:px-10 sm:py-12">
        <div role={failed ? 'alert' : 'status'}>
          <div
            className="relative mx-auto mb-7 flex size-20 items-center justify-center"
            aria-hidden="true"
          >
            {failed ? (
              <div className="flex size-16 items-center justify-center rounded-full bg-[#f9eee9] text-[#a64d37]">
                <WarningCircle className="size-8" />
              </div>
            ) : (
              <>
                <span className="absolute inset-0 rounded-full border-2 border-[#e4eee0]" />
                <span className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#476f42] motion-safe:animate-spin" />
                <img src="/abaco-logo.svg" alt="" className="w-12" />
              </>
            )}
          </div>
          <h1 id="login-title" className="text-2xl font-semibold tracking-[-0.04em] text-[#172519]">
            {failed ? 'No se pudo completar el acceso' : 'Conectando con Google'}
          </h1>
          <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-[#667468]">
            {failed
              ? 'Vuelve a intentarlo o, si ya has entrado, continúa a tu cuenta.'
              : 'Estamos preparando tu espacio de trabajo. Un momento, por favor.'}
          </p>
        </div>
        {failed ? (
          <Link
            to="/"
            className="mt-7 inline-flex min-h-11 items-center justify-center rounded-xl bg-[#294b32] px-6 text-sm font-semibold text-white hover:bg-[#203b2b] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#476f42]"
          >
            Continuar
          </Link>
        ) : null}
      </div>
    </LoginLayout>
  )
}
