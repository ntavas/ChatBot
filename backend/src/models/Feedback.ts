// Feedback.ts
// Mongoose schema and model for the `feedbacks` collection.
// Κάθε έγγραφο εδώ αντιπροσωπεύει την αξιολόγηση ενός χρήστη για μια απάντηση του bot.
// Αποθηκεύει την ψήφο (θετική/αρνητική), το ερώτημα, την απάντηση και
// την κατάσταση επεξεργασίας για τον κύκλο Human-in-the-Loop (Φάση 2).
//
// Εξαρτάται από: mongoose
// Χρησιμοποιείται από: feedbackRepository.ts, adminRepository.ts

import mongoose, { Schema, Document } from "mongoose";

/** Μορφή ενός εγγράφου feedback στη MongoDB. */
export interface FeedbackDocument extends Document {
  // Το μοναδικό ID του μηνύματος του bot που αξιολογήθηκε
  messageId: string;
  // Το ID της συνομιλίας στην οποία ανήκει η αξιολόγηση
  sessionId: string;
  // Αριθμητική αξιολόγηση: +1 = θετική (👍), -1 = αρνητική (👎)
  rating: 1 | -1;
  // Το ερώτημα του χρήστη — αποθηκεύεται τη στιγμή της υποβολής (Φάση 2.2)
  userQuestion?: string | null;
  // Η απάντηση του bot που αξιολογήθηκε — αποθηκεύεται τη στιγμή της υποβολής (Φάση 2.2)
  botAnswer?: string | null;
  // Η σωστή απάντηση από χρήστη ή διαχειριστή
  correction?: string | null;
  // Κατάσταση επεξεργασίας: "pending" → "approved" ή "rejected"
  status: "pending" | "approved" | "rejected";
  // Κατηγορία του ερωτήματος (π.χ. "returns", "shipping") — προαιρετικό
  category?: string | null;
  // Θέση του μηνύματος μέσα στη συνομιλία (0-based) — προαιρετικό
  messageIndex?: number | null;
  createdAt: Date;
}

const FeedbackSchema = new Schema<FeedbackDocument>(
  {
    // messageId: Το μοναδικό ID του μηνύματος του bot που αξιολογήθηκε.
    // Χρησιμοποιείται για να συνδέσει το feedback με τη συγκεκριμένη απάντηση στη συνομιλία.
    messageId: { type: String, required: true },

    // sessionId: Το ID της συνομιλίας στην οποία ανήκει η αξιολόγηση.
    // Επιτρέπει την ανάκτηση του πλαισίου της συζήτησης αν χρειαστεί.
    sessionId: { type: String, required: true },

    // rating: Αριθμητική αξιολόγηση του χρήστη.
    // +1 = θετική (👍), -1 = αρνητική (👎).
    // Χρησιμοποιείται αντί για string ("up"/"down") για ευκολότερη ανάλυση.
    rating: { type: Number, enum: [1, -1], required: true },

    // userQuestion: Το ερώτημα που έκανε ο χρήστης πριν από την απάντηση του bot.
    // Αποθηκεύεται τη στιγμή της αξιολόγησης ώστε να μην χρειάζεται join με τη συνομιλία.
    // Συμπληρώνεται από το frontend στη Φάση 2.2.
    userQuestion: { type: String, default: null },

    // botAnswer: Η απάντηση του bot που αξιολογήθηκε.
    // Αποθηκεύεται για άμεση εμφάνιση στον πίνακα διαχείρισης.
    // Συμπληρώνεται από το frontend στη Φάση 2.2.
    botAnswer: { type: String, default: null },

    // correction: Η σωστή απάντηση που υποβλήθηκε από τον χρήστη ή τον διαχειριστή.
    // Εγκεκριμένες διορθώσεις εισάγονται ως "golden rules" στο system prompt.
    correction: { type: String, default: null },

    // status: Η κατάσταση επεξεργασίας από τον διαχειριστή.
    // "pending" = αναμένει επεξεργασία | "approved" = εγκρίθηκε | "rejected" = απορρίφθηκε
    // Μόνο τα "approved" feedbacks εισάγονται στο system prompt (Φάση 2.3).
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    // category: Η κατηγορία του ερωτήματος (π.χ. "returns", "shipping", "payments").
    // Επιτρέπει φιλτράρισμα και στατιστικά ανά θεματική ενότητα.
    category: { type: String, default: null },

    // messageIndex: Η θέση (0-based) του μηνύματος μέσα στη συνομιλία.
    // Βοηθά στον εντοπισμό πλαισίου χωρίς πλήρη φόρτωση της συνομιλίας.
    messageIndex: { type: Number, default: null },
  },
  { timestamps: true } // Mongoose αυτόματα διαχειρίζεται το createdAt
);

export const FeedbackModel = mongoose.model<FeedbackDocument>("Feedback", FeedbackSchema);
