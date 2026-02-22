// feedbackRoutes.ts
// Defines the POST /api/feedback endpoint.
// Validates the request and writes the vote directly to the repository.
// No service layer needed — there is no business logic, only a data write.

import { Router, Request, Response, NextFunction } from "express";
import * as feedbackRepository from "../repositories/feedbackRepository";
import { FeedbackRequest, FeedbackVote } from "../types/index";

export const feedbackRouter = Router();

const VALID_VOTES: FeedbackVote[] = ["up", "down"];

/**
 * POST /api/feedback
 *
 * Body:
 *   messageId {string} required — the ID of the assistant message being rated
 *   sessionId {string} required — the session the message belongs to
 *   vote      {"up"|"down"} required — the user's rating
 *
 * Response:
 *   { success: true }
 */
feedbackRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  const { messageId, sessionId, vote }: FeedbackRequest = req.body;

  if (!messageId || typeof messageId !== "string") {
    res.status(400).json({ error: "`messageId` is required and must be a string." });
    return;
  }
  if (!sessionId || typeof sessionId !== "string") {
    res.status(400).json({ error: "`sessionId` is required and must be a string." });
    return;
  }
  if (!vote || !VALID_VOTES.includes(vote)) {
    res.status(400).json({ error: '`vote` is required and must be "up" or "down".' });
    return;
  }

  try {
    await feedbackRepository.SaveFeedback(messageId, sessionId, vote);
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
});
