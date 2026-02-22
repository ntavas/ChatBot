// ChatWindow.tsx
// The main chat component. Owns all state: session ID, message history,
// loading indicator, and error banner. Reads/writes to localStorage for persistence.
//
// NOTE: Message history and session ID are stored in localStorage for UI persistence
// across page refreshes. Switching to a different browser or device, or clearing
// localStorage, will show an empty UI — the backend still has the full conversation
// history in MongoDB, but the browser will not display past messages.

import { useState, useEffect, useRef, KeyboardEvent } from 'react'
import type { DisplayMessage } from '../types'
import { SendMessage } from '../services/apiService'
import { MessageBubble } from './MessageBubble'

const SESSION_ID_KEY = 'chatSessionId'
const MESSAGES_KEY = 'chatMessages'
const ERROR_AUTO_DISMISS_MS = 4000

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
 */
export function ChatWindow() {
  const [sessionId] = useState<string>(() => {
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

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const errorTimerRef = useRef<number | null>(null)

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
    <div className="flex flex-col h-screen bg-gray-950 text-white">

      {/* ── Header ── */}
      <header className="flex-shrink-0 bg-gray-900 border-b border-gray-800">
        <div className="max-w-3xl mx-auto px-4 py-3.5 flex items-center gap-3">
          <span className="text-xl">🤖</span>
          <div>
            <h1 className="text-sm font-semibold text-white leading-tight">AI Support Chat</h1>
            <p className="text-xs text-gray-400">Ask me anything</p>
          </div>
        </div>
      </header>

      {/* ── Message list ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">

          {/* Empty state */}
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center h-64 text-gray-600 gap-2 select-none">
              <span className="text-4xl">💬</span>
              <p className="text-sm">Send a message to start the conversation.</p>
            </div>
          )}

          {/* Conversation */}
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              sessionId={sessionId}
              onError={ShowError}
            />
          ))}

          {/* Bot typing indicator */}
          {isLoading && (
            <div className="flex items-start gap-2.5 mb-4">
              <div className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-900 flex items-center justify-center text-sm">
                🤖
              </div>
              <div className="bg-gray-800 px-4 py-3.5 rounded-2xl rounded-tl-sm flex gap-1 items-center">
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          )}

          {/* Scroll anchor */}
          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* ── Error banner ── */}
      {error && (
        <div className="flex-shrink-0 bg-red-950 border-t border-red-900">
          <div className="max-w-3xl mx-auto px-4 py-2.5 text-red-300 text-sm flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        </div>
      )}

      {/* ── Input area ── */}
      <footer className="flex-shrink-0 bg-gray-900 border-t border-gray-800">
        <div className="max-w-3xl mx-auto px-4 py-3 flex gap-2 items-end">
          <textarea
            className="flex-1 bg-gray-800 text-white placeholder-gray-500 text-sm px-3.5 py-2.5 rounded-xl border border-gray-700 focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
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
            className="flex-shrink-0 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:cursor-not-allowed text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors duration-150"
          >
            Send
          </button>
        </div>
      </footer>

    </div>
  )
}
