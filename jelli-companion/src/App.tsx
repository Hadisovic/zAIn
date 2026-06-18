import { useEffect, useState } from 'react'
import { BlobCanvas } from '@/components/BlobCanvas'
import { ChatWidget } from '@/components/ChatWidget'
import { ChatTextbox } from '@/components/ChatTextbox'
import { useConfigStore } from '@/stores/config'
import { useChatStore } from '@/stores/chat'
import { startSidecar, stopSidecar, onLlmToken, onLlmDone, onLlmClear, onLlmError, onAudioChunk, onAudioDone, onSidecarStatus, hideChatWindow, getWindowLabel, loadSettings, onOpenSettings } from '@/lib/api'
import { audioPlayer } from '@/lib/audio'

const isDev = import.meta.env.DEV

function App() {
  const [windowLabel, setWindowLabel] = useState('main')

  useEffect(() => {
    getWindowLabel().then(setWindowLabel).catch(() => {})
  }, [])

  // Load persisted settings on startup
  useEffect(() => {
    loadSettings().then((data) => {
      useConfigStore.getState().loadSettings(data as Record<string, unknown>)
    }).catch(() => {})
  }, [])

  // Apply blob opacity to canvas
  const blobOpacity = useConfigStore((s) => s.blobOpacity)

  useEffect(() => {
    if (!isDev) {
      const handler = (e: Event) => {
        e.preventDefault()
        e.stopPropagation()
      }
      document.addEventListener('contextmenu', handler, { capture: true })
      return () => document.removeEventListener('contextmenu', handler, { capture: true })
    }
  }, [])

  useEffect(() => {
    if (!isDev) {
      const handler = (e: MouseEvent) => {
        if (e.button === 2) {
          e.preventDefault()
        }
      }
      document.addEventListener('mousedown', handler, { capture: true })
      return () => document.removeEventListener('mousedown', handler, { capture: true })
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'Space') {
        e.preventDefault()
        const expanded = useConfigStore.getState().expanded
        useConfigStore.getState().setExpanded(!expanded)
      }
      if (e.key === 'Escape') {
        const textboxOpen = useConfigStore.getState().textboxOpen
        const expanded = useConfigStore.getState().expanded
        if (textboxOpen) {
          useConfigStore.getState().setTextboxOpen(false)
          hideChatWindow().catch(() => {})
        } else if (expanded) {
          useConfigStore.getState().setExpanded(false)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Auto-start sidecar only in the main window
  useEffect(() => {
    if (windowLabel !== 'main') return

    const w = window as unknown as Record<string, unknown>
    if (w['__sidecarStarted']) return
    w['__sidecarStarted'] = true

    const init = async () => {
      try {
        await startSidecar('python', ['sidecar/tts_sidecar.py'])
      } catch (e) {
        console.warn('[sidecar] Failed to start:', e)
      }
    }
    init()
    return () => {
      w['__sidecarStarted'] = false
      stopSidecar().catch(() => {})
    }
  }, [windowLabel])

  // LLM event listeners — both windows need them
  useEffect(() => {
    let active = true
    const unlisteners: (() => void)[] = []

    const setupListeners = async () => {
      const u1 = await onLlmToken(({ request_id, token }) => {
        if (!active) return
        const msgId = useChatStore.getState().getMessageIdForRequest(request_id)
        if (msgId) {
          useChatStore.getState().appendToMessage(msgId, token)
        }
      })
      if (!active) { u1(); return; }
      unlisteners.push(u1)

      const u2 = await onLlmDone(({ request_id }) => {
        if (!active) return
        const msgId = useChatStore.getState().getMessageIdForRequest(request_id)
        if (msgId) {
          const msg = useChatStore.getState().messages.find((m) => m.id === msgId)
          if (msg) {
            const cleanedText = msg.text.replace(/[#\s]+$/, '').trim()
            useChatStore.getState().updateMessage(msgId, { text: cleanedText, status: 'done' })
          } else {
            useChatStore.getState().updateMessage(msgId, { status: 'done' })
          }
        }
        useChatStore.getState().setProcessing(false)
      })
      if (!active) { u2(); return; }
      unlisteners.push(u2)

      const uLlmClear = await onLlmClear(({ request_id }) => {
        if (!active) return
        const msgId = useChatStore.getState().getMessageIdForRequest(request_id)
        if (msgId) {
          useChatStore.getState().updateMessage(msgId, { text: '' })
        }
      })
      if (!active) { uLlmClear(); return; }
      unlisteners.push(uLlmClear)

      const u3 = await onLlmError(({ request_id, message }) => {
        if (!active) return
        const msgId = useChatStore.getState().getMessageIdForRequest(request_id)
        if (msgId) {
          useChatStore.getState().updateMessage(msgId, {
            text: `Error: ${message}`,
            status: 'done',
          })
        }
        useChatStore.getState().setProcessing(false)
      })
      if (!active) { u3(); return; }
      unlisteners.push(u3)

      const u4 = await onAudioChunk(({ pcm_base64 }) => {
        if (!active) return
        useChatStore.getState().setPlayingAudio(true)
        audioPlayer.enqueueChunk(pcm_base64)
      })
      if (!active) { u4(); return; }
      unlisteners.push(u4)

      const u5 = await onAudioDone(() => {
        if (!active) return
        useChatStore.getState().setPlayingAudio(false)
      })
      if (!active) { u5(); return; }
      unlisteners.push(u5)

      const u6 = await onSidecarStatus(({ status, message }) => {
        if (!active) return
        console.log(`[sidecar] ${status}${message ? `: ${message}` : ''}`)
      })
      if (!active) { u6(); return; }
      unlisteners.push(u6)
    }

    setupListeners()

    return () => {
      active = false
      unlisteners.forEach((fn) => fn())
    }
  }, [])

  // Listen for the cross-window open-settings event
  useEffect(() => {
    if (windowLabel !== 'main') return

    let active = true
    let unlisten: (() => void) | null = null

    onOpenSettings(() => {
      if (!active) return
      useConfigStore.getState().setExpanded(true)
      useConfigStore.getState().setSettingsOpen(true)
    }).then((fn) => {
      if (!active) { fn(); return; }
      unlisten = fn
    })

    return () => {
      active = false
      if (unlisten) unlisten()
    }
  }, [windowLabel])

  if (windowLabel === 'chat') {
    return <ChatTextbox />
  }

  return (
    <>
      <div style={{ opacity: blobOpacity }}>
        <BlobCanvas />
      </div>
      <ChatWidget />
    </>
  )
}

export default App
