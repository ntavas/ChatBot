// index.ts
// Frontend-specific TypeScript types.
// These are defined independently from the backend — do not import backend types here.

export type FeedbackVote = 'up' | 'down'

export type MessageRole = 'user' | 'assistant'

/**
 * A single message as displayed in the chat UI.
 * Bot messages use the messageId returned by the backend (needed for feedback submission).
 * User messages use a locally-generated ID used only as a React key.
 */
export interface DisplayMessage {
  id: string
  role: MessageRole
  content: string
}

/** The shape returned by POST /api/chat */
export interface SendMessageResponse {
  sessionId: string
  reply: string
  messageId: string
}

/** A thumbs-down entry enriched with context, returned by GET /api/admin/feedback */
export interface AdminFeedbackEntry {
  messageId: string
  sessionId: string
  /** ISO date string from JSON serialization */
  createdAt: string
  /** Admin-supplied correction. Null until saved. */
  correction: string | null
  /** The bad bot reply that was thumbed down. */
  botMessage: string | null
  /** The user message immediately before the bad bot reply. */
  userQuestion: string | null
}
