// chatService.ts
// Ενορχηστρώνει ολόκληρη τη ροή του chat: RAG αναζήτηση → κατασκευή prompt →
// κλήση AI provider → αποθήκευση → επιστροφή απάντησης.

import { v4 as uuidv4 } from "uuid";
import { GetAIProvider } from "../config/aiProviderFactory";
import * as conversationRepository from "../repositories/conversationRepository";
import * as feedbackRepository from "../repositories/feedbackRepository";
import { FindRelevantDocs, BuildRAGContext } from "./ragService";
import { Message, ChatResponse } from "../types/index";

// Cap how many negative examples we inject — guards against token bloat if thumbs-downs accumulate.
const MAX_NEGATIVE_EXAMPLES = 5;

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

  // ── Ενότητα feedback (αρνητικά παραδείγματα) ──────────────────────────────
  // Φέρνουμε τα πιο πρόσφατα αρνητικά feedbacks για να τα αποφύγει ο bot
  const negativeFeedback = await feedbackRepository.GetNegativeFeedback();

  if (negativeFeedback.length === 0) {
    return basePrompt;
  }

  const recentNegatives = negativeFeedback.slice(0, MAX_NEGATIVE_EXAMPLES);
  const messageIds = recentNegatives.map((f) => f.messageId);
  const badMessages = await conversationRepository.GetMessagesByIds(messageIds);
  const badBotReplies = badMessages.filter((m) => m.role === "assistant");

  if (badBotReplies.length === 0) {
    return basePrompt;
  }

  // Χτίζουμε map από messageId → correction για να συμπεριλάβουμε τις διορθώσεις
  const correctionMap = new Map<string, string | null>();
  for (const f of recentNegatives) {
    correctionMap.set(f.messageId, f.correction ?? null);
  }

  const exampleLines = badBotReplies
    .map((m) => {
      const correction = correctionMap.get(m.messageId);
      if (correction) {
        return `- Απέφυγε: "${m.content}". Πες αντί αυτού: "${correction}"`;
      }
      return `- Απέφυγε αυτό το είδος απάντησης: "${m.content}"`;
    })
    .join("\n");

  const negativeExamplesSection =
    `ΑΠΟΦΥΓΕ ΑΥΤΕΣ ΤΙΣ ΑΠΑΝΤΗΣΕΙΣ (αξιολογήθηκαν αρνητικά από χρήστες):\n${exampleLines}`;

  return `${basePrompt}\n\n${negativeExamplesSection}`;
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
