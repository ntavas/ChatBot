// adminRepository.ts
// Queries βάσης δεδομένων για τον πίνακα διαχείρισης.
// Επιστρέφει αρνητικές αξιολογήσεις εμπλουτισμένες με το μήνυμα του bot
// και το ερώτημα του χρήστη, ώστε ο διαχειριστής να έχει πλαίσιο για τη διόρθωση.
//
// Στρατηγική ανάκτησης πλαισίου:
//   1. Αν το feedback έχει αποθηκευμένα userQuestion/botAnswer (Φάση 2.2+), χρησιμοποιεί αυτά.
//   2. Αλλιώς, κάνει join με τη συνομιλία για να τα ανακτήσει (fallback για παλαιά δεδομένα).
//
// Εξαρτάται από: models/Feedback.ts, models/Conversation.ts, types/index.ts
// Χρησιμοποιείται από: adminRoutes.ts

import { FeedbackModel } from "../models/Feedback";
import { ConversationModel } from "../models/Conversation";
import { AdminFeedbackEntry, FeedbackStats } from "../types/index";

/**
 * Επιστρέφει όλες τις αρνητικές αξιολογήσεις εμπλουτισμένες με την κακή απάντηση του bot
 * και το ερώτημα του χρήστη που την προκάλεσε, ταξινομημένες από νεότερη σε παλαιότερη.
 *
 * Η ανάκτηση γίνεται σε 2 βήματα:
 *   1. Ανάκτηση όλων των αρνητικών feedback (rating: -1).
 *   2. Για όσα δεν έχουν αποθηκευμένο πλαίσιο, batch-fetch των συνομιλιών με ένα query.
 *
 * @returns Πίνακας AdminFeedbackEntry, από νεότερο σε παλαιότερο.
 * @throws Error αν αποτύχει οποιοδήποτε query.
 */
export async function GetAdminFeedback(): Promise<AdminFeedbackEntry[]> {
  // Ανάκτηση αρνητικών αξιολογήσεων με rating: -1 (νέο schema Φάσης 2.1)
  const negativeFeedback = await FeedbackModel.find({ rating: -1 })
    .sort({ createdAt: -1 })
    .lean();

  if (negativeFeedback.length === 0) {
    return [];
  }

  // Εντοπισμός εγγραφών που δεν έχουν αποθηκευμένο πλαίσιο — χρειάζονται join
  // Αυτό συμβαίνει για παλαιά δεδομένα πριν τη Φάση 2.2
  const needsJoin = negativeFeedback.filter((f) => !f.userQuestion || !f.botAnswer);
  const uniqueSessionIds = [...new Set(needsJoin.map((f) => f.sessionId))];

  // Χάρτης sessionId → messages για O(1) πρόσβαση (αποφυγή N+1 queries)
  const sessionMap = new Map<string, { messageId: string; role: string; content: string }[]>();

  if (uniqueSessionIds.length > 0) {
    // Batch-fetch όλων των σχετικών συνομιλιών σε ένα μόνο query
    const conversations = await ConversationModel.find({
      sessionId: { $in: uniqueSessionIds },
    }).lean();

    for (const conv of conversations) {
      sessionMap.set(conv.sessionId, conv.messages as { messageId: string; role: string; content: string }[]);
    }
  }

  return negativeFeedback.map((feedback) => {
    // Προτεραιότητα: χρήση αποθηκευμένων τιμών (Φάση 2.2+)
    let userQuestion: string | null = feedback.userQuestion ?? null;
    let botAnswer: string | null = feedback.botAnswer ?? null;

    // Fallback: join με τη συνομιλία για εγγραφές χωρίς αποθηκευμένο πλαίσιο
    if (!userQuestion || !botAnswer) {
      const messages = sessionMap.get(feedback.sessionId) ?? [];

      // Εύρεση του μηνύματος του bot βάσει messageId
      const botIndex = messages.findIndex((m) => m.messageId === feedback.messageId);

      if (botIndex !== -1) {
        // Το ερώτημα του χρήστη είναι το αμέσως προηγούμενο μήνυμα
        botAnswer = botAnswer ?? messages[botIndex].content;
        userQuestion = userQuestion ?? (botIndex > 0 ? messages[botIndex - 1].content : null);
      }
    }

    return {
      messageId: feedback.messageId,
      sessionId: feedback.sessionId,
      createdAt: feedback.createdAt,
      correction: feedback.correction ?? null,
      botAnswer,
      userQuestion,
      status: feedback.status,
    };
  });
}

/**
 * Επιστρέφει στατιστικά για τον πίνακα ελέγχου του admin.
 *
 * Περιλαμβάνει:
 *   - Σύνολο αξιολογήσεων (θετικές + αρνητικές)
 *   - Ποσοστά θετικών / αρνητικών
 *   - Κατανομή κατά κατάσταση (pending / approved / rejected)
 *
 * @returns Αντικείμενο FeedbackStats με όλα τα στατιστικά.
 * @throws Error αν αποτύχει το aggregation query.
 */
export async function GetFeedbackStats(): Promise<FeedbackStats> {
  // Aggregation για μετρήσεις κατά rating και status σε ένα query
  const agg = await FeedbackModel.aggregate([
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        positive: { $sum: { $cond: [{ $eq: ["$rating", 1] }, 1, 0] } },
        negative: { $sum: { $cond: [{ $eq: ["$rating", -1] }, 1, 0] } },
        pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
        approved: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } },
      },
    },
  ]);

  // Αν δεν υπάρχουν καθόλου feedbacks, επιστρέφουμε μηδενικές τιμές
  if (agg.length === 0) {
    return { total: 0, positive: 0, negative: 0, positivePercent: 0, negativePercent: 0, pending: 0, approved: 0, rejected: 0 };
  }

  const { total, positive, negative, pending, approved, rejected } = agg[0];

  return {
    total,
    positive,
    negative,
    // Ποσοστά στρογγυλοποιημένα σε 1 δεκαδικό
    positivePercent: total > 0 ? Math.round((positive / total) * 1000) / 10 : 0,
    negativePercent: total > 0 ? Math.round((negative / total) * 1000) / 10 : 0,
    pending,
    approved,
    rejected,
  };
}
