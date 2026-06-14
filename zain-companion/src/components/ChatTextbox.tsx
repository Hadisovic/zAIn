import { useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { useConfigStore } from '@/stores/config'
import { useChatStore } from '@/stores/chat'
import { sendChatMessage } from '@/lib/api'

/**
 * Simple UUID v4 generator using Web Crypto API (no external dependency)
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * ChatTextbox — small floating input that appears above/near the blob when clicked.
 * Sends text to AI on Enter, closes on Escape or click outside.
 */
export function ChatTextbox() {
  const textboxOpen = useConfigStore((s) => s.textboxOpen)
  const setTextboxOpen = useConfigStore((s) => s.setTextboxOpen)
  const addMessage = useChatStore((s) => s.addMessage)
  const setProcessing = useChatStore((s) => s.setProcessing)
  const isProcessing = useChatStore((s) => s.isProcessing)
  const isPlayingAudio = useChatStore((s) => s.isPlayingAudio)
  const registerRequest = useChatStore((s) => s.registerRequest)
  const lastAssistant = useChatStore((s) => {
    for (let i = s.messages.length - 1; i >= 0; i--) {
      if (s.messages[i].role === 'assistant') return s.messages[i]
    }
    return null
  })
  const config = useConfigStore()

  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-focus when textbox opens
  useEffect(() => {
    if (textboxOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [textboxOpen])

  // Close on Escape or click outside
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && textboxOpen) {
        setTextboxOpen(false)
      }
    }

    const handleClickOutside = (e: MouseEvent) => {
      if (!containerRef.current) return
      const target = e.target as Node | null
      if (target && !containerRef.current.contains(target)) {
        // Ignore clicks that originate from the blob canvas — it is what
        // opens us in the first place, and we don't want to close immediately.
        if (target instanceof Element && target.tagName === 'CANVAS') return
        setTextboxOpen(false)
      }
    }

    if (textboxOpen) {
      window.addEventListener('keydown', handleKeyDown)
      window.addEventListener('click', handleClickOutside)
      return () => {
        window.removeEventListener('keydown', handleKeyDown)
        window.removeEventListener('click', handleClickOutside)
      }
    }
  }, [textboxOpen, setTextboxOpen])

  const handleSend = useCallback(async () => {
    const text = inputRef.current?.value.trim()
    if (!text || isProcessing) return

    console.log('[ChatTextbox] Sending message:', text)

    // Add user message to chat
    addMessage({
      text,
      role: 'user',
      status: 'sent',
    })

    // Add AI response placeholder
    const assistantMsgId = addMessage({
      text: '',
      role: 'assistant',
      status: 'thinking',
    })

    // Clear input and keep textbox open (don't close yet)
    if (inputRef.current) {
      inputRef.current.value = ''
    }
    setProcessing(true)

    // Send to LLM
    try {
      const requestId = generateUUID()
      console.log('[ChatTextbox] Request ID:', requestId)
      registerRequest(requestId, assistantMsgId)

      const messages = useChatStore.getState().messages.map((m) => ({
        role: m.role,
        content: m.text,
      }))

      console.log('[ChatTextbox] Config:', {
        provider: config.llmProvider,
        model: config.llmModel,
        ollamaUrl: config.ollamaUrl,
      })

      await sendChatMessage(requestId, messages, {
        provider: config.llmProvider,
        model: config.llmModel,
        api_key: config.apiKey || undefined,
        api_url: config.llmProvider === 'ollama' ? config.ollamaUrl : undefined,
        temperature: config.temperature,
        max_tokens: config.maxTokens,
        speaker_id: config.speakerId,
        quantization: config.quantization,
      })
      console.log('[ChatTextbox] Message sent successfully')
    } catch (e) {
      console.error('[ChatTextbox] Failed to send message:', e)
      useChatStore.getState().updateMessage(assistantMsgId, {
        text: `Error: ${(e as Error).message || 'Failed to get response'}`,
        status: 'done',
      })
      setProcessing(false)
    }
  }, [addMessage, setProcessing, registerRequest, config, isProcessing])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey && !isProcessing) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend, isProcessing]
  )

  return (
    <AnimatePresence>
      {textboxOpen && (
        <motion.div
          ref={containerRef}
          key="textbox"
          className="fixed bottom-16 right-5 z-30"
          initial={{ opacity: 0, scale: 0.8, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 10 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
        >
          {/* Textbox container with glassmorphism */}
          <div className="glass-panel rounded-2xl p-4 shadow-lg w-80 max-h-64">
            {lastAssistant?.text && (
              <div className="mb-3 max-h-32 overflow-y-auto text-xs text-white/80 whitespace-pre-wrap break-words border-b border-white/10 pb-3">
                <div className="flex items-start gap-2">
                  <div className="flex-1">
                    {lastAssistant.text}
                    {(isProcessing || isPlayingAudio) && (
                      <span className="inline-block w-0.5 h-3 bg-white/50 ml-0.5 align-middle animate-pulse" />
                    )}
                  </div>
                  {isPlayingAudio && (
                    <div className="flex-shrink-0 flex gap-0.5 items-center" title="Playing audio">
                      <span className="w-1 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1 h-3 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '100ms' }} />
                      <span className="w-1 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '200ms' }} />
                    </div>
                  )}
                  {isProcessing && !isPlayingAudio && (
                    <div className="flex-shrink-0 text-xs text-amber-300" title="Generating voice">🎤</div>
                  )}
                </div>
              </div>
            )}
            <div className="flex gap-2 items-center mt-3">
              <input
                ref={inputRef}
                type="text"
                placeholder="Say something..."
                className="flex-1 bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white placeholder-white/50 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/30 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                onKeyDown={handleKeyDown}
                disabled={isProcessing}
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={isProcessing}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700 disabled:from-gray-600 disabled:to-gray-700 text-white transition-all disabled:cursor-not-allowed"
                title="Send (Enter)"
              >
                {isProcessing ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <path d="M1.5 7l10.5-5v10L1.5 7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Arrow pointing to blob */}
          <div className="absolute bottom-0 right-6 w-2 h-2 rotate-45 bg-white/20 -translate-y-px" />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
