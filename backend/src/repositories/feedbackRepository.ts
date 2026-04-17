// feedbackRepository.ts
// Όλα τα MongoDB queries για τη collection `feedbacks`.
// Δεν υπάρχει business logic εδώ — μόνο πρόσβαση στα δεδομένα.
//
// Εξαρτάται από: models/Feedback.ts, types/index.ts
// Χρησιμοποιείται από: feedbackRoutes.ts, chatService.ts

import { FeedbackModel } from "../models/Feedback";
import { FeedbackRating } from "../types/index";

/**
 * Αποθηκεύει μια ψήφο feedback στη βάση δεδομένων.
 *
 * @param messageId - Το ID του μηνύματος του bot που αξιολογήθηκε.
 * @param sessionId - Η συνεδρία στην οποία ανήκει το μήνυμα.
 * @param rating - +1 για θετική, -1 για αρνητική αξιολόγηση.
 * @param opts - Προαιρετικά πεδία: ερώτημα χρήστη, απάντηση bot, κατάσταση.
 * @throws Error αν αποτύχει η εισαγωγή στη MongoDB.
 */
export async function SaveFeedback(
  messageId: string,
  sessionId: string,
  rating: FeedbackRating,
  opts?: {
    userQuestion?: string | null;
    botAnswer?: string | null;
    status?: "pending" | "approved" | "rejected";
    // Διόρθωση από τον χρήστη — υποβάλλεται μαζί με το 👎 (Φάση 2.2)
    correction?: string | null;
  }
): Promise<void> {
  await FeedbackModel.create({
    messageId,
    sessionId,
    rating,
    // Αποθήκευση ερωτήματος και απάντησης για απευθείας εμφάνιση στον admin (Φάση 2.2)
    userQuestion: opts?.userQuestion ?? null,
    botAnswer: opts?.botAnswer ?? null,
    // Διόρθωση από χρήστη — null αν δεν συμπληρώθηκε
    correction: opts?.correction ?? null,
    // Προεπιλογή "pending" — ο admin θα εγκρίνει ή θα απορρίψει (Φάση 2.4)
    status: opts?.status ?? "pending",
  });
}

/**
 * Επιστρέφει όλες τις αρνητικές αξιολογήσεις (rating: -1), ταξινομημένες από νεότερη σε παλαιότερη.
 * Χρησιμοποιείται από το chatService για να εισάγει αρνητικά παραδείγματα στο system prompt.
 *
 * @returns Πίνακας αρνητικών feedback εγγράφων.
 * @throws Error αν αποτύχει το query στη MongoDB.
 */
export async function GetNegativeFeedback() {
  // Φιλτράρισμα με rating: -1 αντί για vote: "down" (νέο schema Φάσης 2.1)
  return FeedbackModel.find({ rating: -1 }).sort({ createdAt: -1 }).lean();
}

/**
 * Αποθηκεύει μια διόρθωση από τον διαχειριστή σε ένα υπάρχον έγγραφο feedback.
 * Η διόρθωση εισάγεται αργότερα στο system prompt δίπλα στην κακή απάντηση.
 *
 * @param messageId - Το messageId του μηνύματος που αξιολογήθηκε αρνητικά.
 * @param correction - Το κείμενο της σωστής απάντησης από τον διαχειριστή.
 * @throws Error αν δεν βρεθεί έγγραφο ή αποτύχει η ενημέρωση.
 */
export async function SaveCorrection(messageId: string, correction: string): Promise<void> {
  await FeedbackModel.findOneAndUpdate(
    { messageId },
    { $set: { correction } }
  );
}

/**
 * Ενημερώνει το status ενός feedback (approve/reject) και προαιρετικά τη διόρθωσή του.
 *
 * Γιατί χρειάζεται:
 *   Μόνο τα "approved" feedbacks εισάγονται ως golden rules στο system prompt.
 *   Ο admin κάνει approve/reject από τον πίνακα διαχείρισης (Φάση 2.4/2.5).
 *
 * @param messageId - Το ID του μηνύματος που αξιολογήθηκε.
 * @param status - Η νέα κατάσταση: "approved" ή "rejected".
 * @param correction - Προαιρετική ενημέρωση της διόρθωσης.
 * @throws Error αν αποτύχει η ενημέρωση.
 */
export async function UpdateFeedbackStatus(
  messageId: string,
  status: "approved" | "rejected",
  correction?: string
): Promise<void> {
  const update: Record<string, string> = { status };
  // Αν ο admin έδωσε διόρθωση μαζί με την έγκριση, αποθηκεύεται και αυτή
  if (typeof correction === "string" && correction.trim()) {
    update.correction = correction.trim();
  }
  await FeedbackModel.findOneAndUpdate({ messageId }, { $set: update });
}
