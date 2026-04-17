// FeedbackButtons.tsx
// Εμφανίζει τα κουμπιά 👍 και 👎 κάτω από κάθε μήνυμα του bot.
// Όταν ο χρήστης κάνει κλικ στο 👎, εμφανίζεται ένα προαιρετικό πεδίο κειμένου
// "Ποια θα ήταν η σωστή απάντηση;" πριν την οριστική υποβολή.
// Μετά την υποβολή, και τα δύο κουμπιά κλειδώνονται και το επιλεγμένο επισημαίνεται.
//
// Εξαρτάται από: apiService.ts, types/index.ts
// Χρησιμοποιείται από: MessageBubble.tsx

import { useState } from 'react'
import { ThumbsUp, ThumbsDown } from 'lucide-react'
import { SubmitFeedback } from '../services/apiService'
import type { FeedbackVote } from '../types'

interface FeedbackButtonsProps {
  messageId: string
  sessionId: string
  // Το ερώτημα του χρήστη που προηγήθηκε — αποστέλλεται μαζί με το feedback
  userQuestion?: string | null
  // Η απάντηση του bot που αξιολογείται — αποστέλλεται μαζί με το feedback
  botAnswer: string
  onError: (message: string) => void
}

/**
 * Εμφανίζει κουμπιά 👍 / 👎 για ένα μήνυμα του bot.
 * Για το 👍: υποβάλλεται αμέσως.
 * Για το 👎: εμφανίζεται πεδίο κειμένου για προαιρετική διόρθωση πριν την υποβολή.
 * Μετά την υποβολή, τα κουμπιά κλειδώνονται και το επιλεγμένο επισημαίνεται.
 */
export function FeedbackButtons({
  messageId,
  sessionId,
  userQuestion,
  botAnswer,
  onError,
}: FeedbackButtonsProps) {
  const [voted, setVoted] = useState<FeedbackVote | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Κατάσταση για το πεδίο διόρθωσης — εμφανίζεται μόνο μετά το 👎
  const [showCorrectionInput, setShowCorrectionInput] = useState(false)
  const [correctionText, setCorrectionText] = useState('')

  /**
   * Υποβάλλει το feedback με όλα τα διαθέσιμα δεδομένα.
   * Χρησιμοποιείται τόσο για το 👍 όσο και για την οριστική υποβολή του 👎.
   */
  async function SubmitVote(vote: FeedbackVote, correction?: string) {
    if (voted !== null || isSubmitting) return
    setIsSubmitting(true)
    try {
      await SubmitFeedback(messageId, sessionId, vote, {
        userQuestion: userQuestion ?? null,
        botAnswer,
        correction: correction && correction.trim() ? correction.trim() : undefined,
      })
      setVoted(vote)
      setShowCorrectionInput(false)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to submit feedback.')
    } finally {
      setIsSubmitting(false)
    }
  }

  /**
   * Χειρίζεται το κλικ στα κουμπιά ψήφου.
   * 👍 → υποβολή αμέσως.
   * 👎 → εμφάνιση πεδίου διόρθωσης πριν την υποβολή.
   */
  function HandleVoteClick(vote: FeedbackVote) {
    if (voted !== null || isSubmitting) return
    if (vote === 'up') {
      SubmitVote('up')
    } else {
      // Εμφάνιση πεδίου διόρθωσης — ο χρήστης μπορεί να γράψει τη σωστή απάντηση
      setShowCorrectionInput(true)
    }
  }

  function GetButtonClass(thisVote: FeedbackVote): string {
    const base = 'p-1 rounded transition-all duration-150'
    if (voted === null && !showCorrectionInput) return `${base} hover:scale-125 cursor-pointer opacity-50 hover:opacity-100`
    if (voted === thisVote) return `${base} cursor-default opacity-100 scale-110`
    if (showCorrectionInput && thisVote === 'down') return `${base} cursor-default opacity-100`
    return `${base} cursor-default opacity-20`
  }

  // ── Κατάσταση μετά την υποβολή ───────────────────────────────────────────────
  if (voted !== null) {
    return (
      <div className="flex gap-0.5 mt-1.5">
        <button disabled title="Good response" className={GetButtonClass('up')} aria-label="Thumbs up"><ThumbsUp size={16} /></button>
        <button disabled title="Bad response" className={GetButtonClass('down')} aria-label="Thumbs down"><ThumbsDown size={16} /></button>
      </div>
    )
  }

  // ── Κατάσταση πεδίου διόρθωσης (εμφανίζεται μετά το 👎) ─────────────────────
  if (showCorrectionInput) {
    return (
      // Αυτό το input εμφανίζεται μόνο μετά από αρνητική αξιολόγηση και είναι προαιρετικό.
      // Ο χρήστης μπορεί να το αφήσει κενό και να πατήσει "Submit" χωρίς διόρθωση.
      <div className="mt-2 flex flex-col gap-2 max-w-sm">
        <div className="flex gap-0.5">
          <button disabled className={GetButtonClass('up')} aria-label="Thumbs up"><ThumbsUp size={16} /></button>
          <button disabled className={GetButtonClass('down')} aria-label="Thumbs down"><ThumbsDown size={16} /></button>
        </div>
        <textarea
          className="w-full bg-gray-50 dark:bg-zinc-700 text-gray-800 dark:text-zinc-100 text-xs rounded-lg px-3 py-2 border border-gray-200 dark:border-zinc-600 resize-none focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:focus:ring-blue-500 placeholder-gray-400 dark:placeholder-zinc-400"
          rows={2}
          placeholder="Ποια θα ήταν η σωστή απάντηση; (προαιρετικό)"
          value={correctionText}
          onChange={(e) => setCorrectionText(e.target.value)}
        />
        <div className="flex gap-2">
          <button
            onClick={() => SubmitVote('down', correctionText)}
            disabled={isSubmitting}
            className="text-xs px-3 py-1 bg-indigo-600 dark:bg-blue-600 hover:bg-indigo-700 dark:hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg transition-colors"
          >
            {isSubmitting ? 'Υποβολή...' : 'Υποβολή'}
          </button>
          <button
            onClick={() => {
              setShowCorrectionInput(false)
              setCorrectionText('')
            }}
            disabled={isSubmitting}
            className="text-xs px-3 py-1 text-gray-400 dark:text-zinc-500 hover:text-gray-600 dark:hover:text-zinc-300 transition-colors"
          >
            Ακύρωση
          </button>
        </div>
      </div>
    )
  }

  // ── Αρχική κατάσταση: εμφάνιση κουμπιών ψήφου ───────────────────────────────
  return (
    <div className="flex gap-0.5 mt-1.5">
      <button
        onClick={() => HandleVoteClick('up')}
        disabled={isSubmitting}
        title="Good response"
        className={GetButtonClass('up')}
        aria-label="Thumbs up"
      >
        <ThumbsUp size={16} />
      </button>
      <button
        onClick={() => HandleVoteClick('down')}
        disabled={isSubmitting}
        title="Bad response"
        className={GetButtonClass('down')}
        aria-label="Thumbs down"
      >
        <ThumbsDown size={16} />
      </button>
    </div>
  )
}
