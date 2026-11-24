import { useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'

import { sessionQuery } from '../application/auth-actions'
import { finishGoogleAuth } from '../application/google-auth'
import { AuthLayout } from './auth-layout'

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
    <AuthLayout
      title={failed ? 'No se pudo completar el acceso' : 'Conectando con Google'}
      description={
        failed
          ? 'Vuelve a intentarlo o, si ya has entrado, continúa a tu cuenta.'
          : 'Espera un momento…'
      }
    >
      {failed ? (
        <Link to="/" className="underline">
          Continuar
        </Link>
      ) : null}
    </AuthLayout>
  )
}
