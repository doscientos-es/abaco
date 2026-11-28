import { useEffect, useEffectEvent, useRef, useState } from 'react'

import {
  currentBrowserRecognition,
  localSpanishAvailability,
  recognizerIfLocal,
  visitDictationLanguage,
  type LocalRecognition,
  type LocalRecognitionClass,
} from './local-visit-speech'

const maximumDuration = 45_000
const stopTimeout = 8_000

type Phase =
  | 'idle'
  | 'checking'
  | 'ready'
  | 'requesting'
  | 'listening'
  | 'processing'
  | 'review'
  | 'fallback'

type DictationStatus = { phase: Phase; message?: string }

function fromError(error: string) {
  switch (error) {
    case 'not-allowed':
    case 'NotAllowedError':
    case 'SecurityError':
      return 'No hay permiso para usar el micrófono. Revísalo en los ajustes del navegador.'
    case 'audio-capture':
    case 'NotFoundError':
    case 'NotReadableError':
      return 'No se pudo acceder al micrófono. Comprueba que esté conectado y libre.'
    case 'no-speech':
    case 'nomatch':
      return 'No se detectó voz. Puedes intentarlo otra vez.'
    case 'language-not-supported':
    case 'language-unavailable':
    case 'service-not-allowed':
      return 'El navegador no puede dictar en español sin salir del dispositivo.'
    default:
      return 'El dictado local se detuvo por un error. Puedes intentarlo otra vez.'
  }
}

export function useLocalVisitDictation(enabled: boolean) {
  const [status, setStatus] = useState<DictationStatus>({ phase: 'idle' })
  const [text, setText] = useState('')
  const checked = useRef<LocalRecognitionClass | null>(null)
  const recognition = useRef<LocalRecognition | null>(null)
  const timer = useRef<number | undefined>(undefined)
  // Invalidates language checks when closing, navigating or switching device context.
  const attempt = useRef(0)

  function clearActive(abort: boolean) {
    window.clearTimeout(timer.current)
    timer.current = undefined
    const active = recognition.current
    recognition.current = null
    if (!active) return
    active.onstart = null
    active.onend = null
    active.onerror = null
    active.onresult = null
    if (!abort) return
    try {
      active.abort()
    } catch {
      // Browsers may already have closed the recognizer; callbacks stay detached.
    }
  }

  function dispose() {
    attempt.current++
    checked.current = null
    clearActive(true)
  }

  function reset() {
    dispose()
    setText('')
    setStatus({ phase: 'idle' })
  }

  const disposeOnUnmount = useEffectEvent(dispose)
  const suspend = useEffectEvent(() => {
    dispose()
    setStatus((previous) => {
      if (!['checking', 'ready', 'requesting', 'listening', 'processing'].includes(previous.phase))
        return previous
      return {
        phase: 'fallback',
        message: 'Se detuvo el dictado local. Puedes revisar el texto recibido o empezar de nuevo.',
      }
    })
  })

  useEffect(() => {
    // Changing report write access must release an active microphone immediately.
    // oxlint-disable-next-line react/set-state-in-effect
    if (!enabled) suspend()
  }, [enabled])

  useEffect(() => {
    function onVisibilityChange() {
      if (document.visibilityState === 'hidden') suspend()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', suspendPage)

    function suspendPage() {
      suspend()
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', suspendPage)
      disposeOnUnmount()
    }
  }, [])

  async function check() {
    if (!enabled || text.trim() || recognition.current || status.phase === 'checking') return
    const request = ++attempt.current
    try {
      const Recognition = currentBrowserRecognition()
      if (!Recognition || !recognizerIfLocal(Recognition)) {
        setStatus({ phase: 'fallback', message: 'Este navegador no ofrece dictado local.' })
        return
      }
      setStatus({ phase: 'checking' })
      const result = await localSpanishAvailability(Recognition)
      if (request !== attempt.current) return
      if (result === 'available') {
        checked.current = Recognition
        setStatus({ phase: 'ready' })
      } else {
        setStatus({
          phase: 'fallback',
          message:
            result === 'downloadable' || result === 'downloading'
              ? 'El paquete de español para dictar sin conexión aún no está instalado.'
              : 'El dictado local en español no está disponible en este navegador.',
        })
      }
    } catch {
      if (request === attempt.current)
        setStatus({ phase: 'fallback', message: 'No se pudo comprobar el dictado local.' })
    }
  }

  function stop() {
    const active = recognition.current
    if (!active) return
    window.clearTimeout(timer.current)
    setStatus({ phase: 'processing' })
    timer.current = window.setTimeout(() => {
      if (recognition.current !== active) return
      clearActive(true)
      setStatus({
        phase: 'fallback',
        message: 'El navegador tardó demasiado. Revisa si se recibió algún texto.',
      })
    }, stopTimeout)
    try {
      active.stop()
    } catch {
      clearActive(true)
      setStatus({ phase: 'fallback', message: 'No se pudo terminar el dictado local.' })
    }
  }

  function start() {
    const Recognition = checked.current
    if (!enabled || text.trim() || !Recognition || recognition.current) return
    checked.current = null
    try {
      const active =
        Recognition === currentBrowserRecognition() ? recognizerIfLocal(Recognition) : null
      if (!active) {
        setStatus({ phase: 'fallback', message: 'El navegador dejó de ofrecer dictado local.' })
        return
      }
      let transcript = ''
      active.lang = visitDictationLanguage
      active.continuous = true
      active.interimResults = false
      active.onstart = () => {
        if (recognition.current === active) setStatus({ phase: 'listening' })
      }
      active.onresult = ({ results }) => {
        if (recognition.current !== active) return
        transcript = Array.from(results)
          .filter((result) => result.isFinal)
          .map((result) => result[0]?.transcript.trim() ?? '')
          .filter(Boolean)
          .join(' ')
        setText(transcript)
      }
      active.onerror = ({ error }) => {
        if (recognition.current !== active) return
        clearActive(true)
        setStatus({ phase: 'fallback', message: fromError(error) })
      }
      active.onend = () => {
        if (recognition.current !== active) return
        clearActive(false)
        setStatus(
          transcript
            ? { phase: 'review' }
            : { phase: 'fallback', message: 'No se recibió texto. Puedes intentarlo otra vez.' },
        )
      }
      recognition.current = active
      setStatus({ phase: 'requesting' })
      timer.current = window.setTimeout(stop, maximumDuration)
      active.start()
    } catch (error) {
      clearActive(true)
      setStatus({ phase: 'fallback', message: fromError(error instanceof Error ? error.name : '') })
    }
  }

  return {
    status,
    text,
    updateText: setText,
    check,
    start,
    stop,
    reset,
  }
}
