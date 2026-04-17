// feedbackRoutes.ts
// Ορίζει το endpoint POST /api/feedback.
// Δέχεται την ψήφο του χρήστη ("up"/"down"), τη μετατρέπει σε αριθμητική αξιολόγηση
// (+1/-1) και την αποθηκεύει μέσω του repository.
// Δεν υπάρχει service layer — δεν απαιτείται business logic, μόνο εγγραφή δεδομένων.
//
// Εξαρτάται από: feedbackRepository.ts, types/index.ts

import { Router, Request, Response, NextFunction } from "express";
import * as feedbackRepository from "../repositories/feedbackRepository";
import { FeedbackRequest, FeedbackVote, FeedbackRating } from "../types/index";

export const feedbackRouter = Router();

// Έγκυρες τιμές ψήφου που αποστέλλει το frontend
const VALID_VOTES: FeedbackVote[] = ["up", "down"];

/**
 * POST /api/feedback
 *
 * Body:
 *   messageId    {string}        required — το ID του μηνύματος που αξιολογήθηκε
 *   sessionId    {string}        required — η συνεδρία στην οποία ανήκει
 *   vote         {"up"|"down"}   required — η ψήφος του χρήστη
 *   userQuestion {string}        optional — το ερώτημα του χρήστη (Φάση 2.2)
 *   botAnswer    {string}        optional — η απάντηση του bot (Φάση 2.2)
 *
 * Response:
 *   { success: true }
 */
feedbackRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  const { messageId, sessionId, vote, userQuestion, botAnswer, correction }: FeedbackRequest = req.body;

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

  // Μετατροπή από string ψήφο σε αριθμητική αξιολόγηση
  // "up" → +1 (θετική εμπειρία), "down" → -1 (αρνητική εμπειρία)
  const rating: FeedbackRating = vote === "up" ? 1 : -1;

  try {
    await feedbackRepository.SaveFeedback(messageId, sessionId, rating, {
      // Πλαίσιο — αποστέλλεται από το frontend για αποθήκευση χωρίς join (Φάση 2.2)
      userQuestion: typeof userQuestion === "string" ? userQuestion : null,
      botAnswer: typeof botAnswer === "string" ? botAnswer : null,
      // Διόρθωση από χρήστη — προαιρετική, υποβάλλεται μαζί με το 👎 (Φάση 2.2)
      correction: typeof correction === "string" && correction.trim() ? correction.trim() : null,
      // Κατάσταση "pending" — αναμένει εγκρίσή από διαχειριστή (Φάση 2.4)
      status: "pending",
    });
    res.status(200).json({ success: true });
  } catch (error) {
    next(error);
  }
});
