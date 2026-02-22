// feedbackRepository.ts
// All MongoDB queries for the `feedbacks` collection.
// No business logic lives here — only data access.

import { FeedbackModel } from "../models/Feedback";
import { FeedbackVote } from "../types/index";

/**
 * Saves a single feedback vote to the database.
 *
 * @param messageId - The ID of the assistant message being rated.
 * @param sessionId - The session the message belongs to.
 * @param vote - "up" or "down".
 * @throws Error if the MongoDB insert fails.
 */
export async function SaveFeedback(
  messageId: string,
  sessionId: string,
  vote: FeedbackVote
): Promise<void> {
  await FeedbackModel.create({ messageId, sessionId, vote });
}

/**
 * Returns all thumbs-down feedback entries, ordered newest first.
 * Used in Phase 5 to inject negative examples into the system prompt.
 *
 * @returns Array of negative feedback documents.
 * @throws Error if the MongoDB query fails.
 */
export async function GetNegativeFeedback() {
  return FeedbackModel.find({ vote: "down" }).sort({ createdAt: -1 }).lean();
}
