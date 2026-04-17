// apiService.ts
// Όλες οι fetch κλήσεις προς το backend API.
// Κάθε συνάρτηση πετάει ένα περιγραφικό Error αν αποτύχει,
// ώστε το UI να μπορεί να εμφανίσει μήνυμα σφάλματος.

import type { AdminFeedbackEntry, FeedbackStats, FeedbackVote, KnowledgeEntry, SendMessageResponse } from '../types'

const BASE_URL = '/api'

// ── Chat ─────────────────────────────────────────────────────────────────────

/**
 * Αποστέλλει μήνυμα χρήστη στο backend και επιστρέφει την απάντηση του bot.
 *
 * @param sessionId - Το τρέχον αναγνωριστικό συνομιλίας.
 * @param message - Το κείμενο του χρήστη.
 * @returns Η απάντηση bot, το sessionId και το messageId της απάντησης.
 * @throws Error αν αποτύχει το αίτημα.
 */
export async function SendMessage(
  sessionId: string,
  message: string,
): Promise<SendMessageResponse> {
  const response = await fetch(`${BASE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, message }),
  })

  const data = await response.json()
  if (!response.ok) throw new Error(data.error ?? 'Failed to send message. Please try again.')
  return data as SendMessageResponse
}

// ── Feedback (user-facing) ────────────────────────────────────────────────────

/**
 * Υποβάλλει ψήφο 👍/👎 για ένα μήνυμα bot.
 * Προαιρετικά αποστέλλει πλαίσιο (ερώτημα, απάντηση, διόρθωση χρήστη).
 */
export async function SubmitFeedback(
  messageId: string,
  sessionId: string,
  vote: FeedbackVote,
  opts?: {
    userQuestion?: string | null
    botAnswer?: string | null
    correction?: string
  },
): Promise<void> {
  const response = await fetch(`${BASE_URL}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messageId,
      sessionId,
      vote,
      ...(opts?.userQuestion ? { userQuestion: opts.userQuestion } : {}),
      ...(opts?.botAnswer ? { botAnswer: opts.botAnswer } : {}),
      ...(opts?.correction ? { correction: opts.correction } : {}),
    }),
  })

  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error ?? 'Failed to submit feedback. Please try again.')
  }
}

// ── Admin — feedback ──────────────────────────────────────────────────────────

/**
 * Φέρνει όλες τις αρνητικές αξιολογήσεις με πλαίσιο για τον πίνακα διαχείρισης.
 */
export async function GetAdminFeedback(): Promise<AdminFeedbackEntry[]> {
  const response = await fetch(`${BASE_URL}/admin/feedback`)
  const data = await response.json()
  if (!response.ok) throw new Error((data as { error?: string }).error ?? 'Failed to load admin feedback.')
  return data as AdminFeedbackEntry[]
}

/**
 * Φέρνει στατιστικά αξιολογήσεων (σύνολο, ποσοστά, κατάσταση).
 */
export async function GetFeedbackStats(): Promise<FeedbackStats> {
  const response = await fetch(`${BASE_URL}/admin/feedback/stats`)
  const data = await response.json()
  if (!response.ok) throw new Error((data as { error?: string }).error ?? 'Failed to load stats.')
  return data as FeedbackStats
}

/**
 * Αποθηκεύει διόρθωση admin (χωρίς αλλαγή status — διατηρείται για συμβατότητα).
 */
export async function SubmitCorrection(messageId: string, correction: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/admin/feedback/${messageId}/correct`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ correction }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error ?? 'Failed to save correction.')
  }
}

/**
 * Εγκρίνει ή απορρίπτει μια αξιολόγηση.
 * Μόνο εγκεκριμένες αξιολογήσεις εισάγονται ως golden rules στο system prompt.
 *
 * @param messageId - Το ID του μηνύματος.
 * @param status - "approved" ή "rejected".
 * @param correction - Προαιρετική ενημέρωση κειμένου διόρθωσης.
 */
export async function UpdateFeedbackStatus(
  messageId: string,
  status: 'approved' | 'rejected',
  correction?: string,
): Promise<void> {
  const response = await fetch(`${BASE_URL}/admin/feedback/${messageId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status, ...(correction ? { correction } : {}) }),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error ?? 'Failed to update feedback.')
  }
}

// ── Admin — knowledge base ────────────────────────────────────────────────────

/**
 * Φέρνει όλες τις ενεργές εγγραφές γνωσιακής βάσης (χωρίς embeddings).
 */
export async function GetKnowledge(): Promise<KnowledgeEntry[]> {
  const response = await fetch(`${BASE_URL}/admin/knowledge`)
  const data = await response.json()
  if (!response.ok) throw new Error((data as { error?: string }).error ?? 'Failed to load knowledge base.')
  return data as KnowledgeEntry[]
}

/**
 * Δημιουργεί νέα εγγραφή γνωσιακής βάσης.
 * Το backend δημιουργεί αυτόματα το embedding — η κλήση μπορεί να πάρει λίγα δευτερόλεπτα.
 */
export async function CreateKnowledge(
  title: string,
  content: string,
  category: string,
): Promise<KnowledgeEntry> {
  const response = await fetch(`${BASE_URL}/admin/knowledge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, content, category }),
  })
  const data = await response.json()
  if (!response.ok) throw new Error((data as { error?: string }).error ?? 'Failed to create entry.')
  return data as KnowledgeEntry
}

/**
 * Ενημερώνει υπάρχουσα εγγραφή γνωσιακής βάσης.
 * Αν αλλάξει το content, το backend ξαναγεννά το embedding αυτόματα.
 */
export async function UpdateKnowledge(
  id: string,
  fields: Partial<{ title: string; content: string; category: string }>,
): Promise<KnowledgeEntry> {
  const response = await fetch(`${BASE_URL}/admin/knowledge/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  const data = await response.json()
  if (!response.ok) throw new Error((data as { error?: string }).error ?? 'Failed to update entry.')
  return data as KnowledgeEntry
}

/**
 * Soft delete: θέτει isActive=false. Η εγγραφή εξαφανίζεται από RAG και admin.
 */
export async function DeleteKnowledge(id: string): Promise<void> {
  const response = await fetch(`${BASE_URL}/admin/knowledge/${id}`, { method: 'DELETE' })
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error((data as { error?: string }).error ?? 'Failed to delete entry.')
  }
}
