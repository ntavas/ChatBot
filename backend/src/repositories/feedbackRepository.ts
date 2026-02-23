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

/**
 * Saves an admin-supplied correction onto an existing feedback document.
 * The correction is later injected into the system prompt alongside the bad answer.
 *
 * @param messageId - The messageId of the thumbed-down bot message.
 * @param correction - The corrected answer text supplied by the admin.
 * @throws Error if no matching document is found or the update fails.
 */
export async function SaveCorrection(messageId: string, correction: string): Promise<void> {
  await FeedbackModel.findOneAndUpdate(
    { messageId },
    { $set: { correction } }
  );
}
