// FeedbackButtons.tsx
// Renders the 👍 and 👎 vote buttons below each bot message.
// Locks after a vote is cast and highlights the chosen option.

import { useState } from 'react'
import { SubmitFeedback } from '../services/apiService'
import type { FeedbackVote } from '../types'

interface FeedbackButtonsProps {
  messageId: string
  sessionId: string
  onError: (message: string) => void
}

/**
 * Displays thumbs up / thumbs down buttons for a bot message.
 * Once the user votes, both buttons are disabled and the selected one is highlighted.
 *
 * @param messageId - The bot message being rated.
 * @param sessionId - The session the message belongs to.
 * @param onError - Called with an error string if the submission fails.
 */
export function FeedbackButtons({ messageId, sessionId, onError }: FeedbackButtonsProps) {
  const [voted, setVoted] = useState<FeedbackVote | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function HandleVote(vote: FeedbackVote) {
    if (voted !== null || isSubmitting) return
    setIsSubmitting(true)
    try {
      await SubmitFeedback(messageId, sessionId, vote)
      setVoted(vote)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Failed to submit feedback.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function GetButtonClass(thisVote: FeedbackVote): string {
    const base = 'text-base px-1 py-0.5 rounded transition-all duration-150'
    if (voted === null) return `${base} hover:scale-125 cursor-pointer opacity-50 hover:opacity-100`
    if (voted === thisVote) return `${base} cursor-default opacity-100 scale-110`
    return `${base} cursor-default opacity-20`
  }

  return (
    <div className="flex gap-0.5 mt-1.5">
      <button
        onClick={() => HandleVote('up')}
        disabled={voted !== null || isSubmitting}
        title="Good response"
        className={GetButtonClass('up')}
        aria-label="Thumbs up"
      >
        👍
      </button>
      <button
        onClick={() => HandleVote('down')}
        disabled={voted !== null || isSubmitting}
        title="Bad response"
        className={GetButtonClass('down')}
        aria-label="Thumbs down"
      >
        👎
      </button>
    </div>
  )
}
