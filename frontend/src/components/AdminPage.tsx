// AdminPage.tsx
// Admin panel that lists all thumbs-down feedback entries.
// Protected by a simple login form (admin / admin) — auth state is stored in
// sessionStorage so it clears automatically when the browser tab closes.
// Uses an accordion layout: each row is compact and shows only a summary.
// Clicking a row expands it to reveal the full question, bad reply, and correction form.
// Supports filtering (all / needs correction / corrected) and pagination (20 per page).

import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { AdminFeedbackEntry } from '../types'
import { GetAdminFeedback, SubmitCorrection } from '../services/apiService'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type FilterTab = 'all' | 'pending' | 'corrected'

/** Number of rows shown per page. */
const PAGE_SIZE = 20

const ADMIN_AUTH_KEY = 'adminAuth'

interface AdminPageProps {
  isDark: boolean
  onToggleTheme: () => void
}

// ── Login form ───────────────────────────────────────────────────────────────

interface AdminLoginProps {
  isDark: boolean
  onToggleTheme: () => void
  onLogin: () => void
}

/**
 * Full-page login form shown when the admin is not authenticated.
 * Validates against hardcoded credentials (admin / admin) client-side.
 *
 * @param onLogin - Called on successful login so the parent can reveal the panel.
 */
function AdminLogin({ isDark, onToggleTheme, onLogin }: AdminLoginProps) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  function HandleSubmit(e: FormEvent) {
    e.preventDefault()
    if (username === 'admin' && password === 'admin') {
      sessionStorage.setItem(ADMIN_AUTH_KEY, 'true')
      onLogin()
    } else {
      setError('Invalid username or password.')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 flex items-center justify-center p-4">

      {/* Theme toggle — top right */}
      <div className="fixed top-4 right-4">
        <button
          onClick={onToggleTheme}
          title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="text-lg leading-none hover:scale-110 transition-transform cursor-pointer"
        >
          {isDark ? '☀️' : '🌙'}
        </button>
      </div>

      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-8 w-full max-w-sm shadow-sm">

        {/* Logo + title */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <img
            src="/technical-support.png"
            alt="Admin"
            className="w-12 h-12 rounded-xl object-cover shadow-sm"
          />
          <div className="text-center">
            <h1 className="font-semibold text-gray-900 dark:text-zinc-100">Admin Panel</h1>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">Sign in to continue</p>
          </div>
        </div>

        <form onSubmit={HandleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1 block">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(null) }}
              className="w-full bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:focus:ring-blue-500"
              placeholder="admin"
              autoComplete="username"
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1 block">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null) }}
              className="w-full bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:focus:ring-blue-500"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
          )}

          <button
            type="submit"
            className="mt-1 w-full bg-indigo-600 dark:bg-blue-600 hover:bg-indigo-700 dark:hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg transition-colors"
          >
            Sign in
          </button>
        </form>

        <p className="text-center mt-6 text-xs text-gray-400 dark:text-zinc-600">
          <Link to="/" className="hover:text-gray-600 dark:hover:text-zinc-400 transition-colors">
            ← Back to chat
          </Link>
        </p>
      </div>

    </div>
  )
}

export function AdminPage({ isDark, onToggleTheme }: AdminPageProps) {
  // Auth gate — show login form until sessionStorage confirms the admin has signed in
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return sessionStorage.getItem(ADMIN_AUTH_KEY) === 'true'
  })

  if (!isAuthenticated) {
    return (
      <AdminLogin
        isDark={isDark}
        onToggleTheme={onToggleTheme}
        onLogin={() => setIsAuthenticated(true)}
      />
    )
  }

  return <AuthenticatedAdminPage isDark={isDark} onToggleTheme={onToggleTheme} />
}

// ── Authenticated panel (only rendered after login) ──────────────────────────

/**
 * The actual admin panel, rendered only after the login gate is passed.
 * Split into its own component so all data-fetching hooks run unconditionally.
 */
function AuthenticatedAdminPage({ isDark, onToggleTheme }: AdminPageProps) {
  const [entries, setEntries] = useState<AdminFeedbackEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Per-entry correction text (pre-filled from existing corrections)
  const [corrections, setCorrections] = useState<Record<string, string>>({})

  // Per-entry save button state
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({})

  const [filter, setFilter] = useState<FilterTab>('all')
  const [currentPage, setCurrentPage] = useState(1)

  // Set of expanded message IDs — only load content for what the admin opens
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    GetAdminFeedback()
      .then((data) => {
        setEntries(data)

        // Pre-fill textarea values from any already-saved corrections
        const initialCorrections: Record<string, string> = {}
        for (const entry of data) {
          initialCorrections[entry.messageId] = entry.correction ?? ''
        }
        setCorrections(initialCorrections)
      })
      .catch((err: Error) => setLoadError(err.message))
      .finally(() => setIsLoading(false))
  }, [])

  // Reset to page 1 whenever the active filter changes
  useEffect(() => {
    setCurrentPage(1)
  }, [filter])

  /**
   * Toggles the expanded state of a single accordion row.
   *
   * @param messageId - The entry to expand or collapse.
   */
  function ToggleExpand(messageId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(messageId)) {
        next.delete(messageId)
      } else {
        next.add(messageId)
      }
      return next
    })
  }

  /**
   * Saves the correction for a single feedback entry.
   * Updates saveStates to show inline button feedback.
   *
   * @param messageId - The ID of the message being corrected.
   */
  async function HandleSave(messageId: string): Promise<void> {
    const correction = corrections[messageId] ?? ''
    setSaveStates((prev) => ({ ...prev, [messageId]: 'saving' }))

    try {
      await SubmitCorrection(messageId, correction)
      setSaveStates((prev) => ({ ...prev, [messageId]: 'saved' }))

      // Reset to idle after 2 seconds so the user can save again if they edit further
      setTimeout(() => {
        setSaveStates((prev) => ({ ...prev, [messageId]: 'idle' }))
      }, 2000)
    } catch {
      setSaveStates((prev) => ({ ...prev, [messageId]: 'error' }))
    }
  }

  // ── Derived state ────────────────────────────────────────────────────────────

  const filteredEntries = entries.filter((entry) => {
    if (filter === 'pending') return !entry.correction
    if (filter === 'corrected') return !!entry.correction
    return true
  })

  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const startIdx = (safePage - 1) * PAGE_SIZE
  const pagedEntries = filteredEntries.slice(startIdx, startIdx + PAGE_SIZE)

  const tabCounts = {
    all: entries.length,
    pending: entries.filter((e) => !e.correction).length,
    corrected: entries.filter((e) => !!e.correction).length,
  }

  // ── Loading / error states ────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-zinc-950 text-gray-500 dark:text-zinc-400">
        Loading feedback...
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-zinc-950 text-red-600 dark:text-red-400">
        Failed to load feedback: {loadError}
      </div>
    )
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100">
      <div className="max-w-3xl mx-auto px-4 py-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">Negative Feedback</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={onToggleTheme}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="text-lg leading-none hover:scale-110 transition-transform cursor-pointer"
            >
              {isDark ? '☀️' : '🌙'}
            </button>
            <Link
              to="/"
              className="text-sm text-indigo-600 dark:text-blue-400 hover:text-indigo-800 dark:hover:text-blue-300 transition-colors"
            >
              ← Back to chat
            </Link>
            <button
              onClick={() => {
                sessionStorage.removeItem(ADMIN_AUTH_KEY)
                // Reload the page so the auth gate re-renders cleanly
                window.location.reload()
              }}
              className="text-sm text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300 transition-colors cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>

        {/* ── Filter tabs ── */}
        <div className="flex gap-1 bg-gray-200 dark:bg-zinc-800 p-1 rounded-xl mb-6 w-fit">
          {(['all', 'pending', 'corrected'] as FilterTab[]).map((tab) => {
            const labels: Record<FilterTab, string> = {
              all: 'All',
              pending: 'Needs correction',
              corrected: 'Corrected',
            }
            const isActive = filter === tab
            return (
              <button
                key={tab}
                onClick={() => setFilter(tab)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                  isActive
                    ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-zinc-100 shadow-sm'
                    : 'text-gray-500 dark:text-zinc-400 hover:text-gray-800 dark:hover:text-zinc-200'
                }`}
              >
                {labels[tab]}
                <span className={`ml-1.5 text-xs font-semibold ${
                  isActive ? 'text-indigo-600 dark:text-blue-400' : 'text-gray-400 dark:text-zinc-600'
                }`}>
                  {tabCounts[tab]}
                </span>
              </button>
            )
          })}
        </div>

        {/* ── Empty state ── */}
        {filteredEntries.length === 0 ? (
          <p className="text-gray-400 dark:text-zinc-500 text-center mt-16 text-sm">
            {filter === 'all'
              ? 'No thumbs-down feedback yet. Come back after users have rated some responses.'
              : filter === 'pending'
              ? 'All entries have been corrected — nice work.'
              : 'No corrected entries yet.'}
          </p>
        ) : (
          <>
            {/* Entry count */}
            <p className="text-xs text-gray-400 dark:text-zinc-500 mb-3">
              Showing {startIdx + 1}–{Math.min(startIdx + PAGE_SIZE, filteredEntries.length)} of {filteredEntries.length}
            </p>

            {/* ── Accordion list ── */}
            <ul className="border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden divide-y divide-gray-200 dark:divide-zinc-800">
              {pagedEntries.map((entry) => {
                const saveState = saveStates[entry.messageId] ?? 'idle'
                const correctionText = corrections[entry.messageId] ?? ''
                const isCorrected = !!entry.correction
                const isExpanded = expandedIds.has(entry.messageId)
                const date = new Date(entry.createdAt).toLocaleString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })

                return (
                  <li key={entry.messageId} className="bg-white dark:bg-zinc-900">

                    {/* ── Collapsed row (always visible, click to expand) ── */}
                    <button
                      onClick={() => ToggleExpand(entry.messageId)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                    >
                      {/* Date */}
                      <span className="text-xs text-gray-400 dark:text-zinc-500 shrink-0 w-28 tabular-nums">
                        {date}
                      </span>

                      {/* Truncated question — takes all available space */}
                      <span className="flex-1 text-sm text-gray-700 dark:text-zinc-200 truncate min-w-0">
                        {entry.userQuestion ?? 'Question not found'}
                      </span>

                      {/* Status badge */}
                      {isCorrected ? (
                        <span className="shrink-0 text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-medium">
                          ✓ Fixed
                        </span>
                      ) : (
                        <span className="shrink-0 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium">
                          Pending
                        </span>
                      )}

                      {/* Chevron rotates on expand */}
                      <span className={`shrink-0 text-gray-400 dark:text-zinc-500 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>
                        ›
                      </span>
                    </button>

                    {/* ── Expanded content (animated with CSS grid trick) ── */}
                    <div className={`grid transition-all duration-200 ease-in-out ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                      <div className="overflow-hidden">
                        <div className="px-4 pb-5 pt-3 flex flex-col gap-4 border-t border-gray-100 dark:border-zinc-800">

                          {/* ── Conversation context ──
                              User question + bad bot reply grouped together as a mini
                              transcript. The bot row gets a faint red tint — no need
                              for colored labels to signal which one is the problem. */}
                          <div className="rounded-lg border border-gray-200 dark:border-zinc-700 overflow-hidden text-sm divide-y divide-gray-200 dark:divide-zinc-700">
                            <div className="flex gap-3 px-3 py-2.5 bg-white dark:bg-zinc-800/40">
                              <span className="text-xs font-medium text-gray-400 dark:text-zinc-500 w-8 shrink-0 pt-0.5">User</span>
                              <p className="text-gray-700 dark:text-zinc-200 flex-1">
                                {entry.userQuestion ?? (
                                  <span className="italic text-gray-400 dark:text-zinc-500">Not found</span>
                                )}
                              </p>
                            </div>
                            <div className="flex gap-3 px-3 py-2.5 bg-red-50 dark:bg-red-950/25">
                              <span className="text-xs font-medium text-gray-400 dark:text-zinc-500 w-8 shrink-0 pt-0.5">Bot</span>
                              <p className="text-gray-700 dark:text-zinc-200 flex-1">
                                {entry.botMessage ?? (
                                  <span className="italic text-gray-400 dark:text-zinc-500">Not found</span>
                                )}
                              </p>
                            </div>
                          </div>

                          {/* ── Correction ── */}
                          <div>
                            <p className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1.5">
                              Correction
                            </p>
                            <textarea
                              className="w-full bg-gray-50 dark:bg-zinc-800 text-gray-800 dark:text-zinc-100 text-sm rounded-lg p-3 border border-gray-200 dark:border-zinc-700 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:focus:ring-blue-500"
                              rows={3}
                              placeholder="What should the bot have said instead?"
                              value={correctionText}
                              onChange={(e) =>
                                setCorrections((prev) => ({
                                  ...prev,
                                  [entry.messageId]: e.target.value,
                                }))
                              }
                            />
                          </div>

                          {/* Save button */}
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => HandleSave(entry.messageId)}
                              disabled={saveState === 'saving' || correctionText.trim() === ''}
                              className="px-4 py-2 bg-indigo-600 dark:bg-blue-600 hover:bg-indigo-700 dark:hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                            >
                              {saveState === 'saving' ? 'Saving...' : 'Save correction'}
                            </button>

                            {saveState === 'saved' && (
                              <span className="text-sm text-green-600 dark:text-green-400">Saved!</span>
                            )}
                            {saveState === 'error' && (
                              <span className="text-sm text-red-600 dark:text-red-400">Failed. Try again.</span>
                            )}
                          </div>

                        </div>
                      </div>
                    </div>

                  </li>
                )
              })}
            </ul>

            {/* ── Pagination ── */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={safePage === 1}
                  className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  ← Previous
                </button>
                <span className="text-sm text-gray-500 dark:text-zinc-400">
                  Page {safePage} of {totalPages}
                </span>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={safePage === totalPages}
                  className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next →
                </button>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  )
}
