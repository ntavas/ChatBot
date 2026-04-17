// index.ts
// Κοινόχρηστοι TypeScript τύποι και interfaces που χρησιμοποιούνται σε όλο το backend.
// Εισάγετε από εδώ — μην ορίζετε ξανά αυτούς τους τύπους σε άλλα αρχεία.

/** Η ψήφος του χρήστη όπως αποστέλλεται από το frontend ("up" ή "down"). */
export type FeedbackVote = "up" | "down";

/**
 * Αριθμητική αξιολόγηση όπως αποθηκεύεται στη βάση δεδομένων.
 * +1 = θετική (👍), -1 = αρνητική (👎).
 * Η μετατροπή από FeedbackVote σε FeedbackRating γίνεται στο feedbackRoutes.ts.
 */
export type FeedbackRating = 1 | -1;

/** Ο ρόλος ενός συμμετέχοντα σε μια συνομιλία. */
export type MessageRole = "user" | "assistant" | "system";

/**
 * Ένα μεμονωμένο μήνυμα σε μια συνομιλία, όπως αποθηκεύεται στη MongoDB
 * και μεταβιβάζεται στον πάροχο AI.
 */
export interface Message {
  messageId: string;
  role: MessageRole;
  content: string;
  timestamp: Date;
}

/**
 * Μια πλήρης συνεδρία συνομιλίας που περιέχει όλα τα μηνύματα για μια περίοδο χρήστη.
 */
export interface ConversationSession {
  sessionId: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Η μορφή απάντησης που επιστρέφει το chatService.ProcessUserMessage()
 * και αποστέλλεται πίσω στον client από το POST /api/chat.
 */
export interface ChatResponse {
  sessionId: string;
  reply: string;
  /** Το messageId του μηνύματος του bot — χρησιμοποιείται από το frontend για να επισυνάψει ψήφους feedback. */
  messageId: string;
}

/**
 * Η αναμενόμενη μορφή του body για το POST /api/feedback.
 * Το frontend αποστέλλει "up"/"down" — το route το μετατρέπει σε αριθμητική αξιολόγηση.
 */
export interface FeedbackRequest {
  messageId: string;
  sessionId: string;
  /** Η ψήφος ως string — μετατρέπεται σε FeedbackRating (+1/-1) στο feedbackRoutes.ts. */
  vote: FeedbackVote;
  /** Το ερώτημα του χρήστη — προαιρετικό, συμπληρώνεται από το frontend στη Φάση 2.2. */
  userQuestion?: string;
  /** Η απάντηση του bot — προαιρετικό, συμπληρώνεται από το frontend στη Φάση 2.2. */
  botAnswer?: string;
  /** Προαιρετική διόρθωση από τον χρήστη ("Ποια θα ήταν η σωστή απάντηση;") — Φάση 2.2. */
  correction?: string;
}

/**
 * Στατιστικά αξιολογήσεων για τον πίνακα ελέγχου του admin.
 * Επιστρέφεται από GET /api/admin/feedback/stats.
 */
export interface FeedbackStats {
  total: number;
  positive: number;
  negative: number;
  positivePercent: number;
  negativePercent: number;
  pending: number;
  approved: number;
  rejected: number;
}

/**
 * Μια αρνητική αξιολόγηση εμπλουτισμένη με το μήνυμα του bot και το
 * ερώτημα του χρήστη που το προκάλεσε, για εμφάνιση στον πίνακα διαχείρισης.
 */
export interface AdminFeedbackEntry {
  messageId: string;
  sessionId: string;
  createdAt: Date;
  /** Διόρθωση από διαχειριστή. Null μέχρι να αποθηκευτεί. */
  correction: string | null;
  /** Η κακή απάντηση του bot που αξιολογήθηκε αρνητικά. */
  botAnswer: string | null;
  /** Το μήνυμα του χρήστη αμέσως πριν από την κακή απάντηση. */
  userQuestion: string | null;
  /** Κατάσταση επεξεργασίας: "pending" | "approved" | "rejected". */
  status: string;
}
