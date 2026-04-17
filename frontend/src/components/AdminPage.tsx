// AdminPage.tsx
// Πίνακας διαχείρισης — προσβάσιμος μόνο από τον διαχειριστή.
// Επιτρέπει την παρακολούθηση του bot, τη βελτίωση των απαντήσεών του
// και τη διαχείριση της γνωσιακής βάσης.
//
// Δύο καρτέλες:
//   1. Dashboard  — στατιστικά + λίστα αρνητικών αξιολογήσεων με approve/reject
//   2. Knowledge Base — CRUD εγγραφών γνωσιακής βάσης
//
// Εξαρτάται από: apiService.ts, types/index.ts

import React, { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import {
  Sun, Moon, LayoutDashboard, BookOpen,
  ThumbsUp, ThumbsDown, Clock, RefreshCw,
  Lightbulb, Loader, Plus, Check, X,
  Pencil, Trash2, ChevronRight,
} from 'lucide-react'
import type { AdminFeedbackEntry, FeedbackStats, KnowledgeEntry } from '../types'
import {
  GetAdminFeedback, GetFeedbackStats, SubmitCorrection,
  UpdateFeedbackStatus, GetKnowledge, CreateKnowledge,
  UpdateKnowledge, DeleteKnowledge,
} from '../services/apiService'

// ── Σταθερές ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 20
const ADMIN_AUTH_KEY = 'adminAuth'
const VALID_CATEGORIES = ['returns', 'shipping', 'payments', 'products', 'account'] as const
type KnowledgeCategory = typeof VALID_CATEGORIES[number]

const CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
  returns: 'Returns', shipping: 'Shipping', payments: 'Payments',
  products: 'Products', account: 'Account',
}
const CATEGORY_COLORS: Record<KnowledgeCategory, string> = {
  returns: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
  shipping: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
  payments: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
  products: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
  account: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
}

type TabId = 'dashboard' | 'knowledge'
type SaveState = 'idle' | 'saving' | 'saved' | 'error'
type FilterTab = 'all' | 'pending' | 'corrected'
type ActionState = 'idle' | 'working' | 'approved' | 'rejected'

interface AdminPageProps { isDark: boolean; onToggleTheme: () => void }

// ── Login form ────────────────────────────────────────────────────────────────

function AdminLogin({ isDark, onToggleTheme, onLogin }: AdminPageProps & { onLogin: () => void }) {
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
      <div className="fixed top-4 right-4">
        <button onClick={onToggleTheme} className="p-1.5 rounded-lg text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer">
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-2xl p-8 w-full max-w-sm shadow-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <img src="/technical-support.png" alt="Admin" className="w-12 h-12 rounded-xl object-cover shadow-sm" />
          <div className="text-center">
            <h1 className="font-semibold text-gray-900 dark:text-zinc-100">Admin Panel</h1>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mt-0.5">Sign in to continue</p>
          </div>
        </div>
        <form onSubmit={HandleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1 block">Username</label>
            <input type="text" value={username} onChange={(e) => { setUsername(e.target.value); setError(null) }}
              className="w-full bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:focus:ring-blue-500"
              placeholder="admin" autoComplete="username" autoFocus />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1 block">Password</label>
            <input type="password" value={password} onChange={(e) => { setPassword(e.target.value); setError(null) }}
              className="w-full bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:focus:ring-blue-500"
              placeholder="••••••••" autoComplete="current-password" />
          </div>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <button type="submit" className="mt-1 w-full bg-indigo-600 dark:bg-blue-600 hover:bg-indigo-700 dark:hover:bg-blue-700 text-white text-sm font-medium py-2 rounded-lg transition-colors">
            Sign in
          </button>
        </form>
        <p className="text-center mt-6 text-xs text-gray-400 dark:text-zinc-600">
          <Link to="/" className="hover:text-gray-600 dark:hover:text-zinc-400 transition-colors">← Back to chat</Link>
        </p>
      </div>
    </div>
  )
}

// ── Root component (auth gate) ────────────────────────────────────────────────

export function AdminPage({ isDark, onToggleTheme }: AdminPageProps) {
  const [isAuthenticated, setIsAuthenticated] = useState(() => sessionStorage.getItem(ADMIN_AUTH_KEY) === 'true')

  if (!isAuthenticated) {
    return <AdminLogin isDark={isDark} onToggleTheme={onToggleTheme} onLogin={() => setIsAuthenticated(true)} />
  }
  return <AuthenticatedAdminPage isDark={isDark} onToggleTheme={onToggleTheme} />
}

// ── Authenticated panel ───────────────────────────────────────────────────────

function AuthenticatedAdminPage({ isDark, onToggleTheme }: AdminPageProps) {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard')

  const tabs: { id: TabId; icon: React.ReactNode; label: string }[] = [
    { id: 'dashboard', icon: <LayoutDashboard size={15} />, label: 'Dashboard' },
    { id: 'knowledge', icon: <BookOpen size={15} />, label: 'Knowledge Base' },
  ]

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-zinc-950 text-gray-900 dark:text-zinc-100">
      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold">Admin Panel</h1>
          <div className="flex items-center gap-3">
            <button onClick={onToggleTheme} className="p-1.5 rounded-lg text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer">
              {isDark ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <Link to="/" className="text-sm text-indigo-600 dark:text-blue-400 hover:text-indigo-800 dark:hover:text-blue-300 transition-colors">← Chat</Link>
            <button onClick={() => { sessionStorage.removeItem(ADMIN_AUTH_KEY); window.location.reload() }}
              className="text-sm text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300 transition-colors cursor-pointer">
              Sign out
            </button>
          </div>
        </div>

        {/* ── Tab navigation ── */}
        <div className="flex gap-1 bg-gray-200 dark:bg-zinc-800 p-1 rounded-xl mb-6 w-fit">
          {tabs.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-zinc-100 shadow-sm'
                  : 'text-gray-500 dark:text-zinc-400 hover:text-gray-800 dark:hover:text-zinc-200'
              }`}>
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>

        {/* ── Active tab content ── */}
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'knowledge' && <KnowledgeTab />}

      </div>
    </div>
  )
}

// ── Dashboard tab ─────────────────────────────────────────────────────────────

function DashboardTab() {
  const [stats, setStats] = useState<FeedbackStats | null>(null)
  const [entries, setEntries] = useState<AdminFeedbackEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [corrections, setCorrections] = useState<Record<string, string>>({})
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({})
  const [actionStates, setActionStates] = useState<Record<string, ActionState>>({})
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState<FilterTab>('all')
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    Promise.all([GetAdminFeedback(), GetFeedbackStats()])
      .then(([feedbackData, statsData]) => {
        setEntries(feedbackData)
        setStats(statsData)
        const init: Record<string, string> = {}
        for (const e of feedbackData) init[e.messageId] = e.correction ?? ''
        setCorrections(init)
      })
      .catch((err: Error) => setLoadError(err.message))
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => { setCurrentPage(1) }, [filter])

  async function HandleRefresh() {
    setIsLoading(true)
    try {
      const [feedbackData, statsData] = await Promise.all([GetAdminFeedback(), GetFeedbackStats()])
      setEntries(feedbackData)
      setStats(statsData)
      const init: Record<string, string> = {}
      for (const e of feedbackData) init[e.messageId] = e.correction ?? ''
      setCorrections(init)
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Failed to refresh.')
    } finally {
      setIsLoading(false)
    }
  }

  function ToggleExpand(messageId: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      next.has(messageId) ? next.delete(messageId) : next.add(messageId)
      return next
    })
  }

  async function HandleSave(messageId: string) {
    const correction = corrections[messageId] ?? ''
    setSaveStates((prev) => ({ ...prev, [messageId]: 'saving' }))
    try {
      await SubmitCorrection(messageId, correction)
      setEntries((prev) => prev.map((e) => e.messageId === messageId ? { ...e, correction } : e))
      setSaveStates((prev) => ({ ...prev, [messageId]: 'saved' }))
      setTimeout(() => setSaveStates((prev) => ({ ...prev, [messageId]: 'idle' })), 2000)
    } catch {
      setSaveStates((prev) => ({ ...prev, [messageId]: 'error' }))
    }
  }

  // Approve/reject — ενημερώνει status και τοπικό state
  async function HandleAction(messageId: string, action: 'approved' | 'rejected') {
    setActionStates((prev) => ({ ...prev, [messageId]: 'working' }))
    try {
      const correction = corrections[messageId]?.trim() || undefined
      await UpdateFeedbackStatus(messageId, action, correction)
      setEntries((prev) => prev.map((e) =>
        e.messageId === messageId ? { ...e, status: action, correction: correction ?? e.correction } : e
      ))
      setStats((prev) => prev ? {
        ...prev,
        pending: Math.max(0, prev.pending - 1),
        approved: action === 'approved' ? prev.approved + 1 : prev.approved,
        rejected: action === 'rejected' ? prev.rejected + 1 : prev.rejected,
      } : prev)
      setActionStates((prev) => ({ ...prev, [messageId]: action }))
    } catch {
      setActionStates((prev) => ({ ...prev, [messageId]: 'idle' }))
    }
  }

  // ── Derived state ──────────────────────────────────────────────────────────

  const filteredEntries = entries.filter((e) => {
    if (filter === 'pending') return !e.correction
    if (filter === 'corrected') return !!e.correction || e.status !== 'pending'
    return true
  })
  const totalPages = Math.max(1, Math.ceil(filteredEntries.length / PAGE_SIZE))
  const safePage = Math.min(currentPage, totalPages)
  const pagedEntries = filteredEntries.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)
  const tabCounts = {
    all: entries.length,
    pending: entries.filter((e) => !e.correction).length,
    corrected: entries.filter((e) => !!e.correction || e.status !== 'pending').length,
  }

  if (isLoading) return <div className="text-center py-16 text-gray-400 dark:text-zinc-500 text-sm">Loading...</div>
  if (loadError) return <div className="text-center py-16 text-red-500 text-sm">{loadError}</div>

  return (
    <div className="flex flex-col gap-6">

      {/* ── Stats cards ── */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Feedback', icon: null, value: stats.total, color: 'text-gray-800 dark:text-zinc-100' },
            { label: 'Positive', icon: <ThumbsUp size={12} />, value: `${stats.positivePercent}%`, color: 'text-green-600 dark:text-green-400' },
            { label: 'Negative', icon: <ThumbsDown size={12} />, value: `${stats.negativePercent}%`, color: 'text-red-600 dark:text-red-400' },
            { label: 'Pending Review', icon: null, value: stats.pending, color: 'text-amber-600 dark:text-amber-400' },
          ].map((card) => (
            <div key={card.label} className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4">
              <p className="text-xs text-gray-400 dark:text-zinc-500 mb-1 flex items-center gap-1">{card.icon}{card.label}</p>
              <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Bar chart (positive vs negative) ── */}
      {stats && stats.total > 0 && (
        <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4">
          <p className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-3">Feedback breakdown</p>
          <div className="flex flex-col gap-2">
            {[
              { label: 'Positive', icon: <ThumbsUp size={12} />, count: stats.positive, pct: stats.positivePercent, bar: 'bg-green-500' },
              { label: 'Negative', icon: <ThumbsDown size={12} />, count: stats.negative, pct: stats.negativePercent, bar: 'bg-red-500' },
              { label: 'Pending', icon: <Clock size={12} />, count: stats.pending, pct: stats.total > 0 ? Math.round(stats.pending / stats.total * 100) : 0, bar: 'bg-amber-400' },
              { label: 'Approved', icon: <Check size={12} />, count: stats.approved, pct: stats.total > 0 ? Math.round(stats.approved / stats.total * 100) : 0, bar: 'bg-indigo-500' },
            ].map((row) => (
              <div key={row.label} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 dark:text-zinc-400 w-24 shrink-0 flex items-center gap-1">{row.icon}{row.label}</span>
                <div className="flex-1 bg-gray-100 dark:bg-zinc-800 rounded-full h-2 overflow-hidden">
                  <div className={`h-full rounded-full ${row.bar} transition-all duration-500`} style={{ width: `${row.pct}%` }} />
                </div>
                <span className="text-xs text-gray-500 dark:text-zinc-400 w-8 text-right tabular-nums">{row.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Feedback list with approve/reject ── */}
      <div>
        {/* Filter tabs + refresh */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex gap-1 bg-gray-200 dark:bg-zinc-800 p-1 rounded-xl w-fit">
            {(['all', 'pending', 'corrected'] as FilterTab[]).map((tab) => {
              const labels = { all: 'All', pending: 'Needs correction', corrected: 'Corrected' }
              return (
                <button key={tab} onClick={() => setFilter(tab)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                    filter === tab
                      ? 'bg-white dark:bg-zinc-700 text-gray-900 dark:text-zinc-100 shadow-sm'
                      : 'text-gray-500 dark:text-zinc-400 hover:text-gray-800 dark:hover:text-zinc-200'
                  }`}>
                  {labels[tab]}
                  <span className={`ml-1.5 text-xs font-semibold ${filter === tab ? 'text-indigo-600 dark:text-blue-400' : 'text-gray-400 dark:text-zinc-600'}`}>
                    {tabCounts[tab]}
                  </span>
                </button>
              )
            })}
          </div>
          <button onClick={HandleRefresh} className="flex items-center gap-1.5 text-sm text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300 transition-colors cursor-pointer">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>

        {filteredEntries.length === 0 ? (
          <p className="text-gray-400 dark:text-zinc-500 text-center mt-10 text-sm">
            {filter === 'pending' ? 'All entries have corrections — nice work.' : filter === 'corrected' ? 'No corrected entries yet.' : 'No feedback yet.'}
          </p>
        ) : (
          <>
            <p className="text-xs text-gray-400 dark:text-zinc-500 mb-3">
              Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filteredEntries.length)} of {filteredEntries.length}
            </p>

            <ul className="border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden divide-y divide-gray-200 dark:divide-zinc-800">
              {pagedEntries.map((entry) => {
                const saveState = saveStates[entry.messageId] ?? 'idle'
                const actionState = actionStates[entry.messageId] ?? (entry.status !== 'pending' ? entry.status as ActionState : 'idle')
                const correctionText = corrections[entry.messageId] ?? ''
                const isExpanded = expandedIds.has(entry.messageId)
                const date = new Date(entry.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })

                return (
                  <li key={entry.messageId} className="bg-white dark:bg-zinc-900">
                    {/* Collapsed row */}
                    <button onClick={() => ToggleExpand(entry.messageId)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-zinc-800 transition-colors cursor-pointer">
                      <span className="text-xs text-gray-400 dark:text-zinc-500 shrink-0 w-28 tabular-nums">{date}</span>
                      <span className="flex-1 text-sm text-gray-700 dark:text-zinc-200 truncate min-w-0">
                        {entry.userQuestion ?? 'Question not found'}
                      </span>
                      {/* Status badge */}
                      {entry.status === 'approved' || actionState === 'approved' ? (
                        <span className="shrink-0 flex items-center gap-1 text-xs bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full font-medium"><Check size={11} /> Approved</span>
                      ) : entry.status === 'rejected' || actionState === 'rejected' ? (
                        <span className="shrink-0 flex items-center gap-1 text-xs bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 px-2 py-0.5 rounded-full font-medium"><X size={11} /> Rejected</span>
                      ) : (
                        <span className="shrink-0 flex items-center gap-1 text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full font-medium"><Clock size={11} /> Pending</span>
                      )}
                      <ChevronRight size={16} className={`shrink-0 text-gray-400 dark:text-zinc-500 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`} />
                    </button>

                    {/* Expanded content */}
                    <div className={`grid transition-all duration-200 ease-in-out ${isExpanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                      <div className="overflow-hidden">
                        <div className="px-4 pb-5 pt-3 flex flex-col gap-4 border-t border-gray-100 dark:border-zinc-800">

                          {/* Conversation context */}
                          <div className="rounded-lg border border-gray-200 dark:border-zinc-700 overflow-hidden text-sm divide-y divide-gray-200 dark:divide-zinc-700">
                            <div className="flex gap-3 px-3 py-2.5 bg-white dark:bg-zinc-800/40">
                              <span className="text-xs font-medium text-gray-400 dark:text-zinc-500 w-8 shrink-0 pt-0.5">User</span>
                              <p className="text-gray-700 dark:text-zinc-200 flex-1">
                                {entry.userQuestion ?? <span className="italic text-gray-400 dark:text-zinc-500">Not found</span>}
                              </p>
                            </div>
                            <div className="flex gap-3 px-3 py-2.5 bg-red-50 dark:bg-red-950/25">
                              <span className="text-xs font-medium text-gray-400 dark:text-zinc-500 w-8 shrink-0 pt-0.5">Bot</span>
                              <p className="text-gray-700 dark:text-zinc-200 flex-1">
                                {entry.botAnswer ?? <span className="italic text-gray-400 dark:text-zinc-500">Not found</span>}
                              </p>
                            </div>
                          </div>

                          {/* Correction */}
                          <div>
                            <p className="text-xs font-medium text-gray-500 dark:text-zinc-400 mb-1.5">Correction</p>
                            {entry.correction && entry.status === 'pending' && (
                              <p className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-blue-400 mb-1.5">
                                <Lightbulb size={13} className="shrink-0" /> Ο χρήστης πρότεινε αυτή τη διόρθωση — μπορείτε να την επεξεργαστείτε παρακάτω.
                              </p>
                            )}
                            <textarea
                              className="w-full bg-gray-50 dark:bg-zinc-800 text-gray-800 dark:text-zinc-100 text-sm rounded-lg p-3 border border-gray-200 dark:border-zinc-700 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:focus:ring-blue-500"
                              rows={3}
                              placeholder="What should the bot have said instead?"
                              value={correctionText}
                              onChange={(e) => setCorrections((prev) => ({ ...prev, [entry.messageId]: e.target.value }))}
                            />
                          </div>

                          {/* Action buttons */}
                          <div className="flex flex-wrap items-center gap-2">
                            {/* Save correction */}
                            <button onClick={() => HandleSave(entry.messageId)}
                              disabled={saveState === 'saving' || correctionText.trim() === ''}
                              className="px-3 py-1.5 bg-gray-100 dark:bg-zinc-700 hover:bg-gray-200 dark:hover:bg-zinc-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-700 dark:text-zinc-200 text-sm rounded-lg transition-colors">
                              {saveState === 'saving' ? 'Saving...' : 'Save'}
                            </button>
                            {saveState === 'saved' && <span className="text-xs text-green-600 dark:text-green-400">Saved</span>}
                            {saveState === 'error' && <span className="text-xs text-red-600 dark:text-red-400">Failed</span>}

                            <div className="flex-1" />

                            {/* Approve / Reject */}
                            {actionState === 'working' ? (
                              <span className="flex items-center gap-1.5 text-xs text-gray-400 dark:text-zinc-500"><Loader size={13} className="animate-spin" /> Working...</span>
                            ) : actionState === 'approved' || entry.status === 'approved' ? (
                              <span className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 font-medium"><Check size={13} /> Approved — will be used as golden rule</span>
                            ) : actionState === 'rejected' || entry.status === 'rejected' ? (
                              <span className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400 font-medium"><X size={13} /> Rejected</span>
                            ) : (
                              <>
                                <button onClick={() => HandleAction(entry.messageId, 'rejected')}
                                  className="flex items-center gap-1.5 px-3 py-1.5 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 text-sm rounded-lg transition-colors cursor-pointer">
                                  <X size={14} /> Reject
                                </button>
                                <button onClick={() => HandleAction(entry.messageId, 'approved')}
                                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 dark:bg-green-700 hover:bg-green-700 dark:hover:bg-green-600 text-white text-sm rounded-lg transition-colors cursor-pointer">
                                  <Check size={14} /> Approve
                                </button>
                              </>
                            )}
                          </div>

                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-6">
                <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={safePage === 1}
                  className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  ← Previous
                </button>
                <span className="text-sm text-gray-500 dark:text-zinc-400">Page {safePage} of {totalPages}</span>
                <button onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
                  className="px-4 py-2 text-sm font-medium text-gray-600 dark:text-zinc-300 bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-700 rounded-lg hover:bg-gray-50 dark:hover:bg-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
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

// ── Knowledge Base tab ────────────────────────────────────────────────────────

function KnowledgeTab() {
  const [entries, setEntries] = useState<KnowledgeEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Φόρμα προσθήκης νέας εγγραφής
  const [addTitle, setAddTitle] = useState('')
  const [addContent, setAddContent] = useState('')
  const [addCategory, setAddCategory] = useState<KnowledgeCategory>('returns')
  const [addState, setAddState] = useState<'idle' | 'saving' | 'error'>('idle')
  const [addError, setAddError] = useState<string | null>(null)

  // Inline επεξεργασία — αποθηκεύει το ID που επεξεργαζόμαστε
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [editCategory, setEditCategory] = useState<KnowledgeCategory>('returns')
  const [editState, setEditState] = useState<'idle' | 'saving' | 'error'>('idle')

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  useEffect(() => {
    GetKnowledge()
      .then(setEntries)
      .catch((err: Error) => setLoadError(err.message))
      .finally(() => setIsLoading(false))
  }, [])

  // ── Προσθήκη νέας εγγραφής ────────────────────────────────────────────────

  async function HandleAdd(e: FormEvent) {
    e.preventDefault()
    if (!addTitle.trim() || !addContent.trim()) return
    setAddState('saving')
    setAddError(null)
    try {
      // Η κλήση μπορεί να πάρει λίγα δευτερόλεπτα — το backend δημιουργεί embedding
      const newEntry = await CreateKnowledge(addTitle.trim(), addContent.trim(), addCategory)
      setEntries((prev) => [newEntry, ...prev])
      setAddTitle('')
      setAddContent('')
      setAddCategory('returns')
      setAddState('idle')
    } catch (err: unknown) {
      setAddError(err instanceof Error ? err.message : 'Failed to create entry.')
      setAddState('error')
    }
  }

  // ── Επεξεργασία εγγραφής ─────────────────────────────────────────────────

  function StartEdit(entry: KnowledgeEntry) {
    setEditingId(entry._id)
    setEditTitle(entry.title)
    setEditContent(entry.content)
    setEditCategory(entry.category as KnowledgeCategory)
    setEditState('idle')
  }

  async function HandleEditSave(id: string) {
    setEditState('saving')
    try {
      const updated = await UpdateKnowledge(id, {
        title: editTitle.trim(),
        content: editContent.trim(),
        category: editCategory,
      })
      setEntries((prev) => prev.map((e) => e._id === id ? updated : e))
      setEditingId(null)
    } catch {
      setEditState('error')
    }
  }

  // ── Διαγραφή εγγραφής ────────────────────────────────────────────────────

  async function HandleDelete(id: string) {
    try {
      await DeleteKnowledge(id)
      setEntries((prev) => prev.filter((e) => e._id !== id))
      setDeleteConfirmId(null)
    } catch {
      // Εμφάνιση σφάλματος — δεν κάνουμε crash
    }
  }

  if (isLoading) return <div className="text-center py-16 text-gray-400 dark:text-zinc-500 text-sm">Loading knowledge base...</div>
  if (loadError) return <div className="text-center py-16 text-red-500 text-sm">{loadError}</div>

  return (
    <div className="flex flex-col gap-6">

      {/* ── Φόρμα προσθήκης ── */}
      <div className="bg-white dark:bg-zinc-900 border border-gray-200 dark:border-zinc-800 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-zinc-200 mb-3">Add new FAQ</h2>
        <form onSubmit={HandleAdd} className="flex flex-col gap-3">
          <div className="flex gap-3">
            <input
              type="text" value={addTitle} onChange={(e) => setAddTitle(e.target.value)}
              placeholder="Title (e.g. «Πολιτική επιστροφών»)"
              className="flex-1 bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:focus:ring-blue-500"
              required
            />
            <select value={addCategory} onChange={(e) => setAddCategory(e.target.value as KnowledgeCategory)}
              className="bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:focus:ring-blue-500">
              {VALID_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
            </select>
          </div>
          <textarea
            value={addContent} onChange={(e) => setAddContent(e.target.value)}
            placeholder="FAQ content — this text will be embedded and searched by the RAG system"
            className="w-full bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:focus:ring-blue-500 resize-none"
            rows={3} required
          />
          {addError && <p className="text-xs text-red-600 dark:text-red-400">{addError}</p>}
          <div className="flex items-center gap-3">
            <button type="submit" disabled={addState === 'saving' || !addTitle.trim() || !addContent.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 dark:bg-blue-600 hover:bg-indigo-700 dark:hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
              {addState === 'saving' ? <><Loader size={14} className="animate-spin" /> Generating embedding...</> : <><Plus size={14} /> Add FAQ</>}
            </button>
            {addState === 'saving' && (
              <span className="text-xs text-gray-400 dark:text-zinc-500">This may take a few seconds on first run.</span>
            )}
          </div>
        </form>
      </div>

      {/* ── Λίστα εγγραφών ── */}
      <div>
        <p className="text-xs text-gray-400 dark:text-zinc-500 mb-3">{entries.length} active entries</p>

        {entries.length === 0 ? (
          <p className="text-center py-12 text-gray-400 dark:text-zinc-500 text-sm">No knowledge base entries found.</p>
        ) : (
          <ul className="border border-gray-200 dark:border-zinc-800 rounded-xl overflow-hidden divide-y divide-gray-200 dark:divide-zinc-800">
            {entries.map((entry) => {
              const isEditing = editingId === entry._id
              const isConfirmingDelete = deleteConfirmId === entry._id
              const catColor = CATEGORY_COLORS[entry.category as KnowledgeCategory] ?? 'bg-gray-100 dark:bg-zinc-700 text-gray-600 dark:text-zinc-300'

              return (
                <li key={entry._id} className="bg-white dark:bg-zinc-900">
                  {isEditing ? (
                    /* Inline edit form */
                    <div className="px-4 py-4 flex flex-col gap-3">
                      <div className="flex gap-3">
                        <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                          className="flex-1 bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:focus:ring-blue-500" />
                        <select value={editCategory} onChange={(e) => setEditCategory(e.target.value as KnowledgeCategory)}
                          className="bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 focus:outline-none">
                          {VALID_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
                        </select>
                      </div>
                      <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)}
                        className="w-full bg-gray-50 dark:bg-zinc-800 text-gray-900 dark:text-zinc-100 text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:focus:ring-blue-500 resize-none"
                        rows={4} />
                      {editState === 'error' && <p className="text-xs text-red-500">Failed to save. Try again.</p>}
                      <div className="flex gap-2">
                        <button onClick={() => HandleEditSave(entry._id)} disabled={editState === 'saving'}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 dark:bg-blue-600 hover:bg-indigo-700 text-white text-sm rounded-lg disabled:opacity-40 transition-colors">
                          {editState === 'saving' ? <><Loader size={14} className="animate-spin" /> Saving...</> : 'Save'}
                        </button>
                        <button onClick={() => setEditingId(null)}
                          className="px-3 py-1.5 text-sm text-gray-400 dark:text-zinc-500 hover:text-gray-700 dark:hover:text-zinc-300 transition-colors">
                          Cancel
                        </button>
                        {editState === 'saving' && (
                          <span className="text-xs text-gray-400 dark:text-zinc-500 self-center">Re-generating embedding if content changed…</span>
                        )}
                      </div>
                    </div>
                  ) : (
                    /* Read row */
                    <div className="flex items-start gap-3 px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-sm font-medium text-gray-800 dark:text-zinc-100 truncate">{entry.title}</span>
                          <span className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${catColor}`}>
                            {CATEGORY_LABELS[entry.category as KnowledgeCategory] ?? entry.category}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-zinc-400 line-clamp-2">{entry.content}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => StartEdit(entry)} title="Edit"
                          className="p-1.5 text-gray-400 dark:text-zinc-500 hover:text-indigo-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer">
                          <Pencil size={15} />
                        </button>
                        {isConfirmingDelete ? (
                          <div className="flex gap-1">
                            <button onClick={() => HandleDelete(entry._id)}
                              className="px-2.5 py-1.5 text-xs bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors cursor-pointer">
                              Confirm
                            </button>
                            <button onClick={() => setDeleteConfirmId(null)}
                              className="px-2.5 py-1.5 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors cursor-pointer">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteConfirmId(entry._id)} title="Delete"
                            className="p-1.5 text-gray-400 dark:text-zinc-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-zinc-800 rounded-lg transition-colors cursor-pointer">
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
