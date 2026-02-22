// index.ts
// Shared TypeScript types and interfaces used across the entire backend.
// Import from here — never redefine these inline in other files.

/** The vote direction a user can submit on a bot message. */
export type FeedbackVote = "up" | "down";

/** The role of a participant in a conversation. */
export type MessageRole = "user" | "assistant" | "system";

/**
 * A single message in a conversation, as stored in MongoDB
 * and passed to the AI provider.
 */
export interface Message {
  messageId: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
}

/**
 * A full conversation session containing all messages for one user session.
 */
export interface ConversationSession {
  sessionId: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * The response shape returned by chatService.ProcessUserMessage()
 * and sent back to the client from POST /api/chat.
 */
export interface ChatResponse {
  sessionId: string;
  reply: string;
  /** The messageId of the assistant's message — used by the frontend to attach feedback votes. */
  messageId: string;
}

/**
 * The expected request body shape for POST /api/feedback.
 */
export interface FeedbackRequest {
  messageId: string;
  sessionId: string;
  vote: FeedbackVote;
}
