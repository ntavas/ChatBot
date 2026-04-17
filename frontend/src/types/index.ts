// index.ts
// Frontend-specific TypeScript types.
// Ορίζονται ανεξάρτητα από το backend — μην εισάγετε backend τύπους εδώ.

export type FeedbackVote = 'up' | 'down'

export type MessageRole = 'user' | 'assistant'

/**
 * Ένα μεμονωμένο μήνυμα όπως εμφανίζεται στο chat UI.
 * Τα μηνύματα bot χρησιμοποιούν το messageId που επιστρέφει το backend (για feedback).
 * Τα μηνύματα χρήστη χρησιμοποιούν τοπικά παραγόμενο ID μόνο ως React key.
 */
export interface DisplayMessage {
  id: string
  role: MessageRole
  content: string
}

/** Η μορφή που επιστρέφει το POST /api/chat */
export interface SendMessageResponse {
  sessionId: string
  reply: string
  messageId: string
}

/** Στατιστικά αξιολογήσεων — επιστρέφονται από GET /api/admin/feedback/stats */
export interface FeedbackStats {
  total: number
  positive: number
  negative: number
  positivePercent: number
  negativePercent: number
  pending: number
  approved: number
  rejected: number
}

/** Μία εγγραφή γνωσιακής βάσης — επιστρέφεται από GET /api/admin/knowledge */
export interface KnowledgeEntry {
  _id: string
  title: string
  content: string
  category: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Μια αρνητική αξιολόγηση εμπλουτισμένη με πλαίσιο, που επιστρέφεται από το GET /api/admin/feedback.
 * Χρησιμοποιείται στον πίνακα διαχείρισης για επισκόπηση και διόρθωση.
 */
export interface AdminFeedbackEntry {
  messageId: string
  sessionId: string
  /** ISO date string από JSON σειριοποίηση */
  createdAt: string
  /** Διόρθωση από διαχειριστή. Null μέχρι να αποθηκευτεί. */
  correction: string | null
  /** Η κακή απάντηση του bot που αξιολογήθηκε αρνητικά. */
  botAnswer: string | null
  /** Το μήνυμα του χρήστη αμέσως πριν από την κακή απάντηση. */
  userQuestion: string | null
  /** Κατάσταση επεξεργασίας: "pending" | "approved" | "rejected". */
  status: string
}
