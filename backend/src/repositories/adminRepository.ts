// adminRepository.ts
// Database queries for the admin panel.
// Enriches thumbs-down feedback with the matching bot reply and user question
// so the admin can read context and supply a correction.

import { FeedbackModel } from "../models/Feedback";
import { ConversationModel } from "../models/Conversation";
import { AdminFeedbackEntry } from "../types/index";

/**
 * Returns all thumbs-down feedback entries enriched with the bad bot reply
 * and the user question that preceded it, ordered newest first.
 *
 * The lookup is done in two DB calls:
 *   1. All negative feedback docs.
 *   2. All related conversations fetched by their unique sessionIds in one query.
 *
 * @returns Array of AdminFeedbackEntry objects, newest first.
 * @throws Error if either MongoDB query fails.
 */
export async function GetAdminFeedback(): Promise<AdminFeedbackEntry[]> {
  const negativeFeedback = await FeedbackModel.find({ vote: "down" })
    .sort({ createdAt: -1 })
    .lean();

  if (negativeFeedback.length === 0) {
    return [];
  }

  // Collect unique sessionIds so we can batch-fetch all related conversations in one query
  const uniqueSessionIds = [...new Set(negativeFeedback.map((f) => f.sessionId))];

  const conversations = await ConversationModel.find({
    sessionId: { $in: uniqueSessionIds },
  }).lean();

  // Build a lookup map: sessionId → messages[] for O(1) access per feedback doc
  const sessionMap = new Map<string, { messageId: string; role: string; content: string }[]>();
  for (const conv of conversations) {
    sessionMap.set(conv.sessionId, conv.messages as { messageId: string; role: string; content: string }[]);
  }

  return negativeFeedback.map((feedback) => {
    const messages = sessionMap.get(feedback.sessionId) ?? [];

    // Find the thumbed-down bot message by its messageId
    const botIndex = messages.findIndex((m) => m.messageId === feedback.messageId);
    const botMessage = botIndex !== -1 ? messages[botIndex].content : null;

    // The user question is the message immediately before the bot reply
    const userQuestion = botIndex > 0 ? messages[botIndex - 1].content : null;

    return {
      messageId: feedback.messageId,
      sessionId: feedback.sessionId,
      createdAt: feedback.createdAt,
      correction: feedback.correction ?? null,
      botMessage,
      userQuestion,
    };
  });
}
