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
