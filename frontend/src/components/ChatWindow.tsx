// ChatWindow.tsx
// The main chat component. Owns all state: session ID, message history,
// loading indicator, and error banner. Reads/writes to localStorage for persistence.
//
// NOTE: Message history and session ID are stored in localStorage for UI persistence
// across page refreshes. Switching to a different browser or device, or clearing
// localStorage, will show an empty UI — the backend still has the full conversation
// history in MongoDB, but the browser will not display past messages.

import { useState, useEffect, useRef, KeyboardEvent } from 'react'
import { Sun, Moon, Trash2, TriangleAlert, Send } from 'lucide-react'
import type { DisplayMessage } from '../types'
import { SendMessage } from '../services/apiService'
import { MessageBubble } from './MessageBubble'

const SESSION_ID_KEY = 'chatSessionId'
const MESSAGES_KEY = 'chatMessages'
const ERROR_AUTO_DISMISS_MS = 4000
/** How long the "Clear?" confirmation state stays active before reverting. */
const CLEAR_CONFIRM_TIMEOUT_MS = 3000

interface ChatWindowProps {
  isDark: boolean
  onToggleTheme: () => void
}

/**
 * Generates a unique session ID using the browser's native crypto API.
 */
function GenerateSessionId(): string {
  return crypto.randomUUID()
}

/**
 * The main chat window. Manages the full chat lifecycle:
 * session initialisation from localStorage, sending messages, displaying history,
 * showing a typing indicator, and surfacing errors without crashing.
 *
 * @param isDark - Whether the dark theme is currently active (used for the toggle icon).
 * @param onToggleTheme - Callback to flip between light and dark mode.
 */
export function ChatWindow({ isDark, onToggleTheme }: ChatWindowProps) {
  const [sessionId, setSessionId] = useState<string>(() => {
    return localStorage.getItem(SESSION_ID_KEY) ?? GenerateSessionId()
  })

  const [messages, setMessages] = useState<DisplayMessage[]>(() => {
    try {
      const stored = localStorage.getItem(MESSAGES_KEY)
      return stored ? (JSON.parse(stored) as DisplayMessage[]) : []
    } catch {
      // Corrupted localStorage — start fresh
      return []
    }
  })

  const [inputText, setInputText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Two-step clear: first click arms it, second click confirms.
  const [confirmingClear, setConfirmingClear] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const errorTimerRef = useRef<number | null>(null)
  const clearTimerRef = useRef<number | null>(null)
  const notificationAudioRef = useRef<HTMLAudioElement | null>(null)

  // Initialise the notification sound and attempt to play it for the welcome message.
  // Most browsers block autoplay before the first user interaction, so the welcome
  // chime will silently fail on cold page loads — that's expected and harmless.
  useEffect(() => {
    notificationAudioRef.current = new Audio('/chat-message-sound.mp3')
    notificationAudioRef.current.volume = 0.5
    notificationAudioRef.current.play().catch(() => {})
  }, [])

  /**
   * Plays the notification chime. Resets playback position so rapid replies
   * each trigger a fresh sound even if the previous one hasn't finished.
   */
  function PlayNotificationSound() {
    if (!notificationAudioRef.current) return
    notificationAudioRef.current.currentTime = 0
    notificationAudioRef.current.play().catch(() => {})
  }

  // Persist sessionId whenever it changes (handles first-render generation)
  useEffect(() => {
    localStorage.setItem(SESSION_ID_KEY, sessionId)
  }, [sessionId])

  // Persist messages and scroll to bottom whenever the message list changes
  useEffect(() => {
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages))
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  /**
   * Shows an error banner and auto-dismisses it after ERROR_AUTO_DISMISS_MS.
   */
  function ShowError(message: string) {
    if (errorTimerRef.current !== null) clearTimeout(errorTimerRef.current)
    setError(message)
    errorTimerRef.current = window.setTimeout(() => setError(null), ERROR_AUTO_DISMISS_MS)
  }

  /**
   * Two-step clear handler. First call arms the confirmation state; second call
   * within CLEAR_CONFIRM_TIMEOUT_MS actually wipes the chat.
   * Clears messages from state and localStorage, and starts a fresh session ID
   * so the next message begins a new backend conversation.
   */
  function HandleClearClick() {
    if (!confirmingClear) {
      setConfirmingClear(true)
      clearTimerRef.current = window.setTimeout(() => setConfirmingClear(false), CLEAR_CONFIRM_TIMEOUT_MS)
    } else {
      if (clearTimerRef.current !== null) clearTimeout(clearTimerRef.current)
      setConfirmingClear(false)
      const newSessionId = GenerateSessionId()
      localStorage.setItem(SESSION_ID_KEY, newSessionId)
      localStorage.removeItem(MESSAGES_KEY)
      setSessionId(newSessionId)
      setMessages([])
    }
  }

  /**
   * Sends the current input to the backend, optimistically adding the user message
   * to the list before the API call completes.
   */
  async function HandleSend() {
    const text = inputText.trim()
    if (!text || isLoading) return

    const userMessage: DisplayMessage = {
      id: GenerateSessionId(),
      role: 'user',
      content: text,
    }

    setMessages((prev) => [...prev, userMessage])
    setInputText('')
    setIsLoading(true)

    try {
      const response = await SendMessage(sessionId, text)
      const botMessage: DisplayMessage = {
        id: response.messageId,
        role: 'assistant',
        content: response.reply,
      }
      setMessages((prev) => [...prev, botMessage])
      PlayNotificationSound()
    } catch (err) {
      ShowError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  /**
   * Submits the message on Enter. Shift+Enter inserts a newline instead.
   */
  function HandleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      HandleSend()
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100">

      {/* ── Header ──
          Light: shadow lifts the bar off the page without a hard border line.
          Dark: explicit border since shadows aren't visible on dark backgrounds. */}
      <header className="flex-shrink-0 bg-white dark:bg-zinc-900 shadow-sm dark:shadow-none dark:border-b dark:border-zinc-800 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center gap-3">
          <img
            src="/technical-support.png"
            alt="Support bot"
            className="w-8 h-8 rounded-lg object-cover flex-shrink-0"
          />
          <div className="flex-1">
            <h1 className="text-sm font-semibold leading-tight">AI Support Chat</h1>
            <p className="text-xs text-gray-500 dark:text-zinc-500">Ask me anything</p>
          </div>

          {/* Clear chat button — only visible when there are messages.
              First click turns red and shows "Clear?"; second click confirms. */}
          {messages.length > 0 && (
            <button
              onClick={HandleClearClick}
              title={confirmingClear ? 'Click again to confirm' : 'Clear chat'}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors duration-150 cursor-pointer ${
                confirmingClear
                  ? 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40'
                  : 'text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800'
              }`}
            >
              <Trash2 size={14} />
              {confirmingClear && <span>Clear?</span>}
            </button>
          )}

          <button
            onClick={onToggleTheme}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="p-1.5 rounded-lg text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            {isDark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      {/* ── Message list ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">

          {/* Welcome message — always shown as the first item in the conversation */}
          <div className="flex items-start gap-2.5 mb-4">
            <div className="flex-shrink-0 w-7 h-7 rounded-full overflow-hidden mt-0.5">
              <img src="/technical-support.png" alt="Bot" className="w-full h-full object-cover" />
            </div>
            <div className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 shadow-sm text-gray-800 dark:text-zinc-100 px-4 py-2.5 rounded-2xl rounded-tl-sm text-sm leading-relaxed max-w-[85%]">
              👋 Hi there! I'm your AI support assistant. I can help you troubleshoot issues, answer questions about our products and services, and guide you step by step. What can I help you with today?
            </div>
          </div>

          {/* Conversation */}
          {messages.map((message, index) => {
            // Εύρεση του προηγούμενου μηνύματος χρήστη για αποθήκευση πλαισίου στο feedback
            // Χρειάζεται μόνο για μηνύματα bot — τα μηνύματα χρήστη δεν έχουν feedback buttons
            const prevMsg = index > 0 ? messages[index - 1] : null
            const userQuestion =
              message.role === 'assistant' && prevMsg?.role === 'user'
                ? prevMsg.content
                : null
            return (
              <MessageBubble
                key={message.id}
                message={message}
                sessionId={sessionId}
                userQuestion={userQuestion}
                onError={ShowError}
              />
            )
          })}

          {/* Bot typing indicator */}
          {isLoading && (
            <div className="flex items-start gap-2.5 mb-4">
              <div className="flex-shrink-0 w-7 h-7 rounded-full overflow-hidden">
                <img src="/technical-support.png" alt="Bot" className="w-full h-full object-cover" />
              </div>
              <div className="bg-white dark:bg-zinc-800 border border-gray-200 dark:border-zinc-700 shadow-sm px-4 py-3.5 rounded-2xl rounded-tl-sm flex gap-1 items-center">
                <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-zinc-500 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-zinc-500 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-gray-400 dark:bg-zinc-500 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}

          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* ── Error banner ── */}
      {error && (
        <div className="flex-shrink-0 bg-red-50 dark:bg-red-950 border-t border-red-200 dark:border-red-900">
          <div className="max-w-3xl mx-auto px-4 py-2.5 text-red-600 dark:text-red-300 text-sm flex items-center gap-2">
            <TriangleAlert size={16} className="flex-shrink-0" />
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* ── Input area ──
          Light: footer bg matches the page (gray-50) so the input box looks like
          a floating card rather than a plain bar stuck to the bottom.
          Dark: matches the dark page bg (zinc-950). */}
      <footer className="flex-shrink-0 bg-gray-50 dark:bg-zinc-950 border-t border-gray-200 dark:border-zinc-800 px-4 py-3">
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-2 items-center bg-white dark:bg-zinc-800 rounded-2xl border border-gray-200 dark:border-zinc-700 shadow-sm px-3.5 py-2">
            <textarea
              className="flex-1 bg-transparent text-gray-900 dark:text-zinc-100 placeholder-gray-400 dark:placeholder-zinc-500 text-sm py-1 focus:outline-none resize-none leading-relaxed"
              placeholder="Type a message… (Enter to send, Shift+Enter for new line)"
              rows={2}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={HandleKeyDown}
              disabled={isLoading}
            />
            <button
              onClick={HandleSend}
              disabled={isLoading || !inputText.trim()}
              title="Send message"
              aria-label="Send message"
              className="flex-shrink-0 bg-indigo-600 hover:bg-indigo-700 dark:bg-blue-600 dark:hover:bg-blue-700 disabled:bg-gray-200 dark:disabled:bg-zinc-700 disabled:text-gray-400 dark:disabled:text-zinc-500 disabled:cursor-not-allowed text-white p-2.5 rounded-xl transition-colors duration-150"
            >
              <Send size={18} />
            </button>
          </div>
        </div>
      </footer>

    </div>
  )
}
