// apiService.ts
// All fetch calls to the backend API.
// Both functions throw a descriptive Error on failure so callers can display it in the UI.

import type { FeedbackVote, SendMessageResponse } from '../types'

const BASE_URL = '/api'

/**
 * Sends a user message to the backend and returns the bot's reply.
 *
 * @param sessionId - The current chat session identifier.
 * @param message - The user's message text.
 * @returns The bot's reply, the updated sessionId, and the reply's messageId.
 * @throws Error with a human-readable message if the request fails.
 */
export async function SendMessage(
  sessionId: string,
  message: string,
): Promise<SendMessageResponse> {
  const response = await fetch(`${BASE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message }),
  })

  const data = await response.json()

  if (!response.ok) {
    throw new Error(data.error ?? 'Failed to send message. Please try again.')
  }

  return data as SendMessageResponse
}

/**
 * Submits a thumbs up or thumbs down vote for a specific bot message.
 *
 * @param messageId - The ID of the assistant message being rated.
 * @param sessionId - The session the message belongs to.
 * @param vote - "up" or "down".
 * @throws Error if the submission fails.
 */
export async function SubmitFeedback(
  messageId: string,
  sessionId: string,
  vote: FeedbackVote,
): Promise<void> {
  const response = await fetch(`${BASE_URL}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messageId, sessionId, vote }),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error ?? 'Failed to submit feedback. Please try again.')
  }
}
