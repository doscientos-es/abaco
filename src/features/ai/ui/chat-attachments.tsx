import { AttachmentPrimitive, ComposerPrimitive, useAui } from '@assistant-ui/react'
import { Image, Microphone, Paperclip, Stop, X } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'

import { createBrowserSupabaseClient } from '@/shared/lib/supabase/client'

import { prepareChatAudio, prepareChatImage } from '../application/prepare-chat-attachment'
import { maxChatAudioSeconds, maxChatImages } from '../domain/chat-attachment-limits'

export function ChatAttachments({
  busy,
  onProcessingChange,
}: {
  busy: boolean
  onProcessingChange: (processing: boolean) => void
}) {
  const aui = useAui()
  const [audioAllowed, setAudioAllowed] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [recording, setRecording] = useState(false)
  const [error, setError] = useState('')
  const imageInput = useRef<HTMLInputElement>(null)
  const audioInput = useRef<HTMLInputElement>(null)
  const locked = useRef(false)
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    void (async () => {
      try {
        const { data } = await createBrowserSupabaseClient().auth.getSession()
        if (!data.session) return
        const response = await fetch('/api/ai_chat', {
          headers: { Authorization: `Bearer ${data.session.access_token}` },
        })
        const result = response.ok ? ((await response.json()) as { audioAllowed?: boolean }) : null
        if (mounted.current) setAudioAllowed(result?.audioAllowed === true)
      } catch {
        /* Audio remains disabled if capabilities cannot be checked. */
      }
    })()
    return () => {
      mounted.current = false
      if (timer.current) clearTimeout(timer.current)
      if (recorder.current?.state === 'recording') recorder.current.stop()
      stream.current?.getTracks().forEach((track) => track.stop())
      onProcessingChange(false)
    }
  }, [onProcessingChange])

  const setWorking = (value: boolean) => {
    locked.current = value
    if (mounted.current) {
      setProcessing(value)
      onProcessingChange(value)
    }
  }

  const addFiles = async (files: File[], kind: 'image' | 'audio') => {
    if (locked.current || busy || !files.length) return
    setWorking(true)
    setError('')
    try {
      const existing = aui.composer.getState().attachments
      const count = existing.filter((item) =>
        kind === 'image' ? item.contentType === 'image/jpeg' : item.contentType === 'audio/wav',
      ).length
      if (count + files.length > (kind === 'image' ? maxChatImages : 1))
        throw new Error(
          kind === 'image' ? 'Puedes adjuntar hasta 5 imágenes.' : 'Puedes adjuntar un audio.',
        )
      for (const file of files) {
        const prepared =
          kind === 'image' ? await prepareChatImage(file) : await prepareChatAudio(file)
        if (!mounted.current) return
        await aui.composer.addAttachment(prepared)
      }
    } catch (cause) {
      if (mounted.current)
        setError(cause instanceof Error ? cause.message : 'No se pudo preparar el adjunto.')
    } finally {
      setWorking(false)
    }
  }

  const startRecording = async () => {
    if (locked.current || busy) return
    if (aui.composer.getState().attachments.some((item) => item.contentType === 'audio/wav')) {
      setError('Puedes adjuntar un audio.')
      return
    }
    setWorking(true)
    setError('')
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true })
      if (!mounted.current) {
        media.getTracks().forEach((track) => track.stop())
        return
      }
      stream.current = media
      const current = new MediaRecorder(media)
      recorder.current = current
      const chunks: Blob[] = []
      current.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data)
      }
      current.onstop = () => {
        if (timer.current) clearTimeout(timer.current)
        media.getTracks().forEach((track) => track.stop())
        stream.current = null
        recorder.current = null
        if (!mounted.current) return
        setRecording(false)
        setWorking(false)
        void addFiles([new File(chunks, 'grabacion', { type: current.mimeType })], 'audio')
      }
      current.onerror = () => {
        if (timer.current) clearTimeout(timer.current)
        media.getTracks().forEach((track) => track.stop())
        current.onstop = null
        recorder.current = null
        stream.current = null
        if (mounted.current) {
          setRecording(false)
          setError('No se pudo grabar el audio.')
        }
        setWorking(false)
      }
      current.start()
      setRecording(true)
      timer.current = setTimeout(
        () => {
          if (current.state === 'recording') current.stop()
        },
        (maxChatAudioSeconds - 1) * 1000,
      )
    } catch {
      stream.current?.getTracks().forEach((track) => track.stop())
      stream.current = null
      if (mounted.current) setError('No se pudo acceder al micrófono.')
      setWorking(false)
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <ComposerPrimitive.Attachments>
          {() => (
            <AttachmentPrimitive.Root className="bg-muted flex max-w-full items-center gap-1 rounded-lg px-2 py-1 text-xs">
              <Paperclip aria-hidden="true" className="size-3" />
              <span className="max-w-32 truncate">
                <AttachmentPrimitive.Name />
              </span>
              <AttachmentPrimitive.Remove
                aria-label="Quitar adjunto"
                className="hover:bg-background rounded p-1"
              >
                <X aria-hidden="true" className="size-3" />
              </AttachmentPrimitive.Remove>
            </AttachmentPrimitive.Root>
          )}
        </ComposerPrimitive.Attachments>
      </div>
      <div className="flex items-center gap-1">
        <input
          ref={imageInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          hidden
          onChange={(event) => {
            const files = Array.from(event.target.files ?? [])
            event.target.value = ''
            void addFiles(files, 'image')
          }}
        />
        <button
          type="button"
          aria-label="Adjuntar imágenes"
          title="Hasta 5 imágenes"
          disabled={busy || processing}
          onClick={() => imageInput.current?.click()}
          className="text-muted-foreground hover:bg-muted rounded-lg p-2 disabled:opacity-40"
        >
          <Image aria-hidden="true" className="size-4" />
        </button>
        {audioAllowed ? (
          <>
            <input
              ref={audioInput}
              type="file"
              accept="audio/*"
              hidden
              onChange={(event) => {
                const files = Array.from(event.target.files ?? [])
                event.target.value = ''
                void addFiles(files, 'audio')
              }}
            />
            <button
              type="button"
              aria-label="Adjuntar audio"
              title="Audio de hasta 15 segundos"
              disabled={busy || processing}
              onClick={() => audioInput.current?.click()}
              className="text-muted-foreground hover:bg-muted rounded-lg p-2 disabled:opacity-40"
            >
              <Paperclip aria-hidden="true" className="size-4" />
            </button>
            <button
              type="button"
              aria-label={recording ? 'Terminar grabación' : 'Grabar audio'}
              disabled={busy || (processing && !recording)}
              onClick={() => (recording ? recorder.current?.stop() : void startRecording())}
              className="text-muted-foreground hover:bg-muted rounded-lg p-2 disabled:opacity-40"
            >
              {recording ? (
                <Stop aria-hidden="true" className="text-destructive size-4" />
              ) : (
                <Microphone aria-hidden="true" className="size-4" />
              )}
            </button>
          </>
        ) : null}
        <span className="text-muted-foreground text-xs">
          {recording ? 'Grabando · máx. 15 s' : processing ? 'Preparando…' : 'Hasta 5 imágenes'}
        </span>
      </div>
      {error ? (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      ) : null}
    </div>
  )
}
