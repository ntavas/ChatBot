// chatService.ts
// Ενορχηστρώνει ολόκληρη τη ροή του chat: RAG αναζήτηση → κατασκευή prompt →
// κλήση AI provider → αποθήκευση → επιστροφή απάντησης.

import { v4 as uuidv4 } from "uuid";
import { GetAIProvider } from "../config/aiProviderFactory";
import * as conversationRepository from "../repositories/conversationRepository";
import { FindRelevantDocs, BuildRAGContext } from "./ragService";
import { GetGoldenRules, GetNegativeExamples, BuildFeedbackPromptSection } from "./feedbackEngine";
import { Message, ChatResponse } from "../types/index";

/**
 * BuildSystemPrompt: Κατασκευάζει δυναμικά το system prompt για κάθε request.
 *
 * Γιατί είναι δυναμικό:
 *   Αντί για ένα σταθερό κείμενο, το prompt αλλάζει σε κάθε request ανάλογα με:
 *   1. Ποια πληροφορία από τη γνωσιακή βάση είναι σχετική με την ερώτηση (RAG context)
 *   2. Ποιες απαντήσεις έχουν αξιολογηθεί αρνητικά (feedback loop)
 *   Έτσι ο bot απαντά πάντα με τη σωστή πληροφορία και αποφεύγει παλιά λάθη.
 *
 * @param ragContext - Το κείμενο από τα σχετικά έγγραφα της γνωσιακής βάσης
 * @returns Το πλήρες system prompt ως string
 */
async function BuildSystemPrompt(ragContext: string): Promise<string> {
  // ── Βασικές οδηγίες συμπεριφοράς ──────────────────────────────────────────
  const baseInstructions = `Είσαι ο ψηφιακός βοηθός υποστήριξης του ShopEasy, ενός online e-shop.
Απάντα μόνο με βάση τις πληροφορίες που σου δίνονται παρακάτω.
Απάντα στη γλώσσα που χρησιμοποιεί ο χρήστης (Ελληνικά ή Αγγλικά).
Μην εφευρίσκεις πληροφορίες που δεν υπάρχουν στο κείμενο.`;

  // ── Ενότητα RAG context ────────────────────────────────────────────────────
  // Αν δεν βρέθηκαν σχετικά έγγραφα, ο bot παραπέμπει σε human agent.
  const knowledgeSection = ragContext
    ? `ΠΛΗΡΟΦΟΡΙΕΣ ΑΠΟ ΤΗ ΓΝΩΣΙΑΚΗ ΒΑΣΗ:
${ragContext}`
    : `ΠΛΗΡΟΦΟΡΙΕΣ ΑΠΟ ΤΗ ΓΝΩΣΙΑΚΗ ΒΑΣΗ:
Δεν βρέθηκαν σχετικές πληροφορίες για αυτήν την ερώτηση.`;

  // ── Κανόνες απάντησης ──────────────────────────────────────────────────────
  const rules = `ΚΑΝΟΝΕΣ:
- Απάντα ΜΟΝΟ με βάση τις παραπάνω πληροφορίες
- Αν δεν υπάρχουν σχετικές πληροφορίες, πες: "Θα σε συνδέσω με έναν εκπρόσωπο υποστήριξης. Επικοινώνησε μαζί μας στο support@shopeasy.com"
- Μην αναφέρεις ότι διαβάζεις από κάποιο έγγραφο ή βάση δεδομένων
- Απάντα φιλικά και επαγγελματικά`;

  const basePrompt = `${baseInstructions}\n\n${knowledgeSection}\n\n${rules}`;

  // ── Ενότητα feedback (golden rules + αρνητικά παραδείγματα) ───────────────
  // Χρησιμοποιούμε το feedbackEngine που χωρίζει:
  //   - Golden rules: εγκεκριμένες διορθώσεις (status: "approved") → "❌ Λάθος → ✅ Σωστό"
  //   - Negative examples: αναξιολόγητα thumbs-down (status: "pending") → "απόφυγε αυτό"
  // Τα δεδομένα (botAnswer, correction) είναι αποθηκευμένα απευθείας στο feedback document
  // (Φάση 2.2) — δεν χρειάζεται πλέον join με τη συνομιλία.
  const [goldenRules, negativeExamples] = await Promise.all([
    GetGoldenRules(),
    GetNegativeExamples(),
  ]);

  const feedbackSection = BuildFeedbackPromptSection(goldenRules, negativeExamples);

  if (feedbackSection) {
    console.log(
      `[ChatService] Feedback injected — golden rules: ${goldenRules.length}, negative examples: ${negativeExamples.length}`
    );
  }

  return feedbackSection ? `${basePrompt}\n\n${feedbackSection}` : basePrompt;
}

/**
 * ProcessUserMessage: Επεξεργάζεται ένα μήνυμα χρήστη μέσα από την πλήρη ροή.
 *
 * Βήματα:
 *   1. Φόρτωση ιστορικού συνομιλίας
 *   2. RAG: εύρεση σχετικών εγγράφων από τη γνωσιακή βάση
 *   3. Κατασκευή δυναμικού system prompt με το RAG context
 *   4. Κλήση AI provider
 *   5. Αποθήκευση μηνυμάτων στη MongoDB
 *   6. Επιστροφή απάντησης
 *
 * @param sessionId - ID της συνομιλίας (νέο ή υπάρχον)
 * @param userMessage - Το κείμενο που έστειλε ο χρήστης
 * @returns sessionId, απάντηση bot, και messageId της απάντησης
 */
export async function ProcessUserMessage(
  sessionId: string,
  userMessage: string
): Promise<ChatResponse> {
  // ── Βήμα 1: Φόρτωση ιστορικού ─────────────────────────────────────────────
  // Επιστρέφει [] για νέες συνομιλίες — το AI ξεκινά χωρίς context
  const history = await conversationRepository.GetSessionHistory(sessionId);

  // ── Βήμα 2: RAG — Εύρεση σχετικών εγγράφων ────────────────────────────────
  // Μετατρέπουμε την ερώτηση σε vector και ψάχνουμε τα πιο σχετικά FAQs
  const ragResults = await FindRelevantDocs(userMessage);
  const ragContext = BuildRAGContext(ragResults);

  if (ragResults.length > 0) {
    console.log(
      `[ChatService] RAG found ${ragResults.length} relevant documents:`,
      ragResults.map((r) => `${r.document.title} (score: ${r.score.toFixed(3)})`)
    );
  } else {
    console.log("[ChatService] RAG: no relevant documents found — bot will escalate to agent.");
  }

  // ── Βήμα 3: Κατασκευή δυναμικού system prompt ─────────────────────────────
  // Συνδυάζει: βασικές οδηγίες + RAG context + αρνητικά παραδείγματα
  const systemPrompt = await BuildSystemPrompt(ragContext);

  // ── Βήμα 4: Κλήση AI provider ─────────────────────────────────────────────
  const userMessageObject: Message = {
    messageId: uuidv4(),
    role: "user",
    content: userMessage,
    timestamp: new Date(),
  };

  // Στέλνουμε ολόκληρο το ιστορικό + το νέο μήνυμα — το AI δεν έχει μνήμη από μόνο του
  const messagesForAI = [...history, userMessageObject];

  const aiProvider = GetAIProvider();
  let replyText: string;
  try {
    replyText = await aiProvider.GenerateResponse(messagesForAI, systemPrompt);
  } catch (error) {
    throw new Error(
      `Failed to generate AI response for session ${sessionId}: ${(error as Error).message}`
    );
  }

  // ── Βήμα 5: Αποθήκευση στη MongoDB ────────────────────────────────────────
  const assistantMessageObject: Message = {
    messageId: uuidv4(),
    role: "assistant",
    content: replyText,
    timestamp: new Date(),
  };

  // upsert: δημιουργεί νέα συνομιλία αν δεν υπάρχει, ή προσθέτει σε υπάρχουσα
  await conversationRepository.SaveMessage(sessionId, userMessageObject);
  await conversationRepository.SaveMessage(sessionId, assistantMessageObject);

  // ── Βήμα 6: Επιστροφή ─────────────────────────────────────────────────────
  // Επιστρέφουμε το messageId της απάντησης ώστε το frontend να μπορεί να
  // συνδέσει το feedback (👍/👎) με τη συγκεκριμένη απάντηση
  return {
    sessionId,
    reply: replyText,
    messageId: assistantMessageObject.messageId,
  };
}
