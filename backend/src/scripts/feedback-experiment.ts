/*
 * feedback-experiment.ts
 *
 * Τι κάνει αυτό το script:
 *   Εκτελεί ένα ελεγχόμενο πείραμα feedback loop σε τρεις φάσεις:
 *
 *   ΦΑΣΗ 1 — Πριν (Before):
 *     Στέλνει 5 edge-case ερωτήσεις στον bot και καταγράφει τις αρχικές
 *     απαντήσεις χωρίς κανένα feedback στη βάση.
 *     Αποθηκεύει: feedback-experiment-before.json
 *
 *   ΦΑΣΗ 2 — Εισαγωγή Διορθώσεων (Inject):
 *     Εισάγει εγκεκριμένες διορθώσεις (status: "approved", testRun: true)
 *     στη MongoDB, προσομοιώνοντας τον admin που εγκρίνει feedback.
 *     Αυτές μετατρέπονται σε "golden rules" που εισάγονται στο system prompt.
 *
 *   ΦΑΣΗ 3 — Μετά (After):
 *     Στέλνει τις ίδιες ερωτήσεις ξανά (νέο session ID) και ελέγχει
 *     αν ο bot ενσωμάτωσε τις διορθώσεις.
 *     Αποθηκεύει: feedback-experiment-after.json
 *     Δημιουργεί: feedback-experiment-report.md
 *
 * Γιατί χρειάζεται:
 *   Αποδεικνύει ποσοτικά ότι ο μηχανισμός Human-in-the-Loop Feedback
 *   βελτιώνει τις απαντήσεις του bot χωρίς επανεκπαίδευση του μοντέλου.
 *   Τα αποτελέσματα χρησιμοποιούνται στο Κεφάλαιο 7 της πτυχιακής.
 *
 * Πώς να το τρέξεις:
 *   cd backend
 *   npx ts-node --transpile-only src/scripts/feedback-experiment.ts
 *
 * Εξαρτήσεις:
 *   - chatService.ts    : ProcessUserMessage για full ροή bot
 *   - ragService.ts     : FindRelevantDocs για ανάκτηση context
 *   - FeedbackModel     : άμεση εισαγωγή golden rules στη MongoDB
 *   - database.ts       : ConnectToDatabase
 */

import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import { ConnectToDatabase } from "../config/database";
import { ProcessUserMessage } from "../services/chatService";
import { FindRelevantDocs } from "../services/ragService";
import { FeedbackModel } from "../models/Feedback";

// ─────────────────────────────────────────────────────────────────────────────
// Σταθερές
// ─────────────────────────────────────────────────────────────────────────────

// Πρόθεμα session ID — ξεχωρίζει από κανονικές συνεδρίες, επιτρέπει καθαρισμό
const EVAL_SESSION_PREFIX = "EVAL_";

// Μέγιστος αριθμός επαναλήψεων για AI κλήσεις που αποτυγχάνουν προσωρινά
const MAX_RETRIES = 3;

// Αναμονή μεταξύ επαναλήψεων (milliseconds)
const RETRY_DELAY_MS = 5000;

// Κατάλογος αποθήκευσης αποτελεσμάτων
const RESULTS_DIR = path.join(__dirname, "../../evaluation-results");

// ─────────────────────────────────────────────────────────────────────────────
// Ορισμός σεναρίων edge-case
//
// Κάθε σενάριο προσομοιώνει μια αλλαγή πολιτικής που ο admin εγκρίνει
// μέσω feedback. Τα keywords χρησιμεύουν για αυτόματη επαλήθευση βελτίωσης.
// ─────────────────────────────────────────────────────────────────────────────
interface ExperimentScenario {
  // Σύντομη περιγραφή για την αναφορά
  description: string;
  // Η ερώτηση που στέλνεται στον bot (πριν και μετά)
  question: string;
  // Η διόρθωση που "εγκρίνει" ο admin — νέα πολιτική ή αλλαγή
  correction: string;
  // Λέξεις-κλειδιά που πρέπει να εμφανιστούν στην απάντηση μετά την έγχυση
  keywords: string[];
}

const SCENARIOS: ExperimentScenario[] = [
  // Σενάριο 1: Νέα απαίτηση φόρμας ΕΠ-2025 για επιστροφές
  {
    description: "Επιστροφές — νέα απαίτηση φόρμας ΕΠ-2025",
    question: "Πόσες μέρες έχω για να επιστρέψω ένα προϊόν;",
    correction:
      "Η πολιτική επιστροφών επιτρέπει επιστροφές εντός 30 ημερών από την παραλαβή. " +
      "ΣΗΜΑΝΤΙΚΟ: Από τον Ιανουάριο 2025, κάθε επιστροφή απαιτεί τη συμπλήρωση " +
      "της φόρμας ΕΠ-2025 μέσα από το λογαριασμό σας πριν αποστείλετε το προϊόν. " +
      "Χωρίς εγκεκριμένη φόρμα ΕΠ-2025, η αίτηση επιστροφής δεν γίνεται αποδεκτή.",
    keywords: ["ΕΠ-2025", "φόρμα"],
  },
  // Σενάριο 2: Μείωση ορίου δωρεάν αποστολής από 39€ σε 25€
  {
    description: "Αποστολή — νέο όριο δωρεάν αποστολής (25€)",
    question: "Η αποστολή είναι δωρεάν;",
    correction:
      "Το όριο για δωρεάν αποστολή μειώθηκε από 39€ σε 25€ από τον Απρίλιο 2025. " +
      "Για παραγγελίες άνω των 25€, η τυπική αποστολή είναι δωρεάν. " +
      "Το παλαιό όριο των 39€ δεν ισχύει πλέον.",
    keywords: ["25€", "25"],
  },
  // Σενάριο 3: Νέα διαδικασία για κατεστραμμένα — υποχρεωτικό τηλέφωνο
  {
    description: "Ελαττωματικά — νέα διαδικασία με τηλέφωνο 210-9000000",
    question: "Έλαβα κατεστραμμένο προϊόν, τι πρέπει να κάνω;",
    correction:
      "Για κατεστραμμένα ή ελαττωματικά προϊόντα, από το 2025 ισχύει νέα διαδικασία: " +
      "Πρέπει να αναφέρετε το πρόβλημα εντός 24 ωρών από την παραλαβή " +
      "και να καλέσετε υποχρεωτικά το 210-9000000 για να λάβετε αριθμό αίτησης. " +
      "Χωρίς αριθμό αίτησης από το 210-9000000, η αντικατάσταση δεν προχωράει.",
    keywords: ["210-9000000", "αριθμό αίτησης"],
  },
  // Σενάριο 4: Μείωση ορίου VIP στο πρόγραμμα πιστότητας
  {
    description: "Πιστότητα — νέο VIP όριο 300 πόντων",
    question: "Πώς λειτουργεί το πρόγραμμα πιστότητας;",
    correction:
      "Το πρόγραμμα ShopEasy Rewards ενημερώθηκε. Από τον Μάρτιο 2025, " +
      "το όριο για VIP status μειώθηκε από 500 σε 300 πόντους. " +
      "Με 300 πόντους αποκτάς αυτόματα VIP πρόσβαση με έκπτωση 15% σε όλες τις αγορές.",
    keywords: ["300", "πόντοι"],
  },
  // Σενάριο 5: Νέα μέθοδος πληρωμής — αποδοχή Bitcoin
  {
    description: "Πληρωμές — αποδοχή Bitcoin από 2025",
    question: "Ποιες μεθόδους πληρωμής δέχεστε;",
    correction:
      "Από τον Φεβρουάριο 2025, το ShopEasy δέχεται και κρυπτονομίσματα. " +
      "Αποδεκτά: Bitcoin (BTC) και Ethereum (ETH) μέσω του συνεργάτη CryptoPay. " +
      "Οι συναλλαγές σε Bitcoin μετατρέπονται αυτόματα σε ευρώ κατά τη στιγμή της αγοράς.",
    keywords: ["Bitcoin", "κρυπτο"],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Τύποι αποτελεσμάτων
// ─────────────────────────────────────────────────────────────────────────────

// Αποτέλεσμα για μια ερώτηση σε μια φάση (before ή after)
interface PhaseResult {
  scenario: string;
  question: string;
  reply: string;
  ragDocTitles: string[];
  timestamp: string;
}

// Συνολικό αποτέλεσμα για ένα σενάριο (πριν + μετά)
interface ExperimentResult {
  scenario: string;
  question: string;
  beforeReply: string;
  afterReply: string;
  ragDocsBefore: string[];
  ragDocsAfter: string[];
  correction: string;
  keywordsFound: string[];
  improved: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Βοηθητικές συναρτήσεις
// ─────────────────────────────────────────────────────────────────────────────

// Τυπώνει γραμμή διαχωρισμού
function printLine(char = "─", length = 70): void {
  console.log(char.repeat(length));
}

// Τυλίγει μακρύ κείμενο σε γραμμές max `width` χαρακτήρων
function wrapText(text: string, indent: string, width = 62): string {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > width) {
      lines.push(indent + current.trim());
      current = word;
    } else {
      current = (current + " " + word).trim();
    }
  }
  if (current.trim()) lines.push(indent + current.trim());
  return lines.join("\n");
}

// Εξάγει τα δευτερόλεπτα αναμονής από το μήνυμα 429 rate-limit του Gemini.
// Παράδειγμα μηνύματος: "Please retry in 21.880236347s"
// Επιστρέφει milliseconds ή null αν δεν βρεθεί.
function parseRetryAfterMs(msg: string): number | null {
  const match = msg.match(/retry in ([\d.]+)s/i);
  if (match) {
    return Math.ceil(parseFloat(match[1]) * 1000) + 2000;
  }
  return null;
}

// Χειρίζεται παροδικά σφάλματα AI παρόχων (rate limit 429 ή overload 503) με επανάληψη
async function retryAICall<T>(
  fn: () => Promise<T>,
  label: string
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const msg = (error as Error).message ?? "";

      // Ημερήσιο όριο quota — δεν έχει νόημα retry, αποτυγχάνει αμέσως
      const isDailyQuota = msg.includes("PerDay") || msg.includes("per_day");
      if (isDailyQuota) {
        console.error(
          `\n  ✗ Ημερήσιο όριο API εξαντλήθηκε (daily quota). Δεν γίνεται retry.`
        );
        console.error(
          `    Λύση: άλλαξε AI_PROVIDER σε "openrouter" στο backend/.env και τρέξε ξανά.\n`
        );
        throw error;
      }

      const isLast = attempt === MAX_RETRIES;

      const isRateLimit = msg.includes("429") || msg.includes("quota") || msg.includes("Too Many Requests");
      const isOverload =
        msg.includes("503") ||
        msg.includes("overload") ||
        msg.includes("unavailable") ||
        msg.includes("high demand");
      const isTransient = isRateLimit || isOverload;

      if (isLast || !isTransient) throw error;

      const waitMs = isRateLimit
        ? (parseRetryAfterMs(msg) ?? 30000)
        : RETRY_DELAY_MS;

      console.log(
        `  ⚠ ${label} — ${isRateLimit ? "Rate limit (429)" : "Overload (503)"}, αναμονή ${(waitMs / 1000).toFixed(0)}s (${attempt}/${MAX_RETRIES})...`
      );
      await new Promise((res) => setTimeout(res, waitMs));
    }
  }
  throw new Error("Εξαντλήθηκαν οι προσπάθειες σύνδεσης.");
}

// Βεβαιώνει ότι ο κατάλογος αποτελεσμάτων υπάρχει
function ensureResultsDir(): void {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

// ─────────────────────────────────────────────────────────────────────────────
// Κύρια ροή πειράματος
// ─────────────────────────────────────────────────────────────────────────────
async function RunFeedbackExperiment(): Promise<void> {
  await ConnectToDatabase();

  // Μοναδικό ID για αυτό το run — αποφεύγει συγκρούσεις αν τρέξει ξανά
  const runId = uuidv4().slice(0, 8);
  const injectionSessionId = `${EVAL_SESSION_PREFIX}fe-${runId}-inject`;

  console.log("\n" + "═".repeat(70));
  console.log("  ShopEasy — Πείραμα Feedback Loop");
  console.log("  Αξιολόγηση Human-in-the-Loop Adaptive Learning");
  console.log("═".repeat(70));
  console.log(`\n  Run ID: ${runId}`);
  console.log(`  Σενάρια: ${SCENARIOS.length}\n`);

  // Καθαρισμός από προηγούμενα test runs (idempotent)
  const cleaned = await FeedbackModel.deleteMany({ testRun: true });
  if (cleaned.deletedCount > 0) {
    console.log(`  (Καθαρίστηκαν ${cleaned.deletedCount} έγγραφα από προηγούμενο test run)\n`);
  }

  // ════════════════════════════════════════════════════════════════════════
  // ΦΑΣΗ 1 — Before: απαντήσεις ΧΩΡΙΣ feedback
  // ════════════════════════════════════════════════════════════════════════
  console.log("ΦΑΣΗ 1 — Baseline (χωρίς feedback στη βάση)");
  printLine();
  console.log("  Στέλνουμε κάθε ερώτηση για πρώτη φορά.\n");

  const beforeResults: PhaseResult[] = [];

  for (let i = 0; i < SCENARIOS.length; i++) {
    const scenario = SCENARIOS[i];
    const sessionId = `${EVAL_SESSION_PREFIX}fe-${runId}-before-${i}`;

    console.log(`  [${i + 1}/${SCENARIOS.length}] ${scenario.description}`);
    console.log(`  Ερώτηση: "${scenario.question}"`);
    console.log("  Bot (πριν feedback):");

    try {
      const chatResult = await retryAICall(
        () => ProcessUserMessage(sessionId, scenario.question),
        `Before-${i + 1}`
      );

      const ragResults = await FindRelevantDocs(scenario.question, 3);
      const ragDocTitles = ragResults.map((r) => r.document.title);

      console.log(wrapText(chatResult.reply, "    "));
      console.log();

      beforeResults.push({
        scenario: scenario.description,
        question: scenario.question,
        reply: chatResult.reply,
        ragDocTitles,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error(`  ✗ Σφάλμα: ${(error as Error).message}\n`);
      beforeResults.push({
        scenario: scenario.description,
        question: scenario.question,
        reply: `ΣΦΑΛΜΑ: ${(error as Error).message}`,
        ragDocTitles: [],
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Αποθήκευση αποτελεσμάτων φάσης 1
  ensureResultsDir();
  const beforePath = path.join(RESULTS_DIR, "feedback-experiment-before.json");
  fs.writeFileSync(
    beforePath,
    JSON.stringify({ runId, phase: "before", results: beforeResults }, null, 2),
    "utf-8"
  );
  console.log(`  ✓ Αποθηκεύτηκε: ${beforePath}\n`);

  // ════════════════════════════════════════════════════════════════════════
  // ΦΑΣΗ 2 — Inject: εισαγωγή εγκεκριμένων διορθώσεων
  //
  // Εισάγουμε approved feedback απευθείας στη MongoDB, παρακάμπτοντας
  // το pending στάδιο. Στην πραγματική ροή: χρήστης → 👎 → admin approve.
  // testRun: true σημαδεύει τα έγγραφα για εύκολο καθαρισμό.
  // ════════════════════════════════════════════════════════════════════════
  console.log("ΦΑΣΗ 2 — Εισαγωγή Εγκεκριμένων Διορθώσεων (Injection)");
  printLine();
  console.log("  [Προσομοίωση admin: εγκρίνει τα feedbacks από τον πίνακα διαχείρισης]\n");

  for (let i = 0; i < SCENARIOS.length; i++) {
    const scenario = SCENARIOS[i];

    try {
      await FeedbackModel.create({
        messageId: `eval-msg-${uuidv4()}`,
        sessionId: injectionSessionId,
        rating: -1,
        status: "approved",
        userQuestion: scenario.question,
        // Η πραγματική απάντηση του bot από τη φάση 1 — η "λάθος" απάντηση
        botAnswer: beforeResults[i].reply,
        correction: scenario.correction,
        // testRun: true — επιτρέπει καθαρισμό από cleanup-test-data.ts
        testRun: true,
      });

      console.log(`  ✓ [${i + 1}/${SCENARIOS.length}] Εγκρίθηκε: ${scenario.description}`);
      console.log(`       Διόρθωση: "${scenario.correction.slice(0, 70)}..."`);
      console.log();
    } catch (error) {
      console.error(`  ✗ Σφάλμα εισαγωγής για σενάριο ${i + 1}: ${(error as Error).message}\n`);
    }
  }

  console.log(`  ${SCENARIOS.length} golden rules εισήχθησαν στη βάση.`);
  console.log(
    "  Το feedbackEngine.GetGoldenRules() θα τα φορτώσει στο επόμενο chat request.\n"
  );

  // ════════════════════════════════════════════════════════════════════════
  // ΦΑΣΗ 3 — After: ίδιες ερωτήσεις με golden rules ενεργά
  // ════════════════════════════════════════════════════════════════════════
  console.log("ΦΑΣΗ 3 — Post-Correction (με golden rules στο system prompt)");
  printLine();
  console.log(
    "  Στέλνουμε τις ίδιες ερωτήσεις ξανά με καινούριο session ID.\n" +
    "  Τώρα το chatService ενσωματώνει τα approved feedbacks στο prompt.\n"
  );

  const afterResults: PhaseResult[] = [];
  const experimentResults: ExperimentResult[] = [];

  for (let i = 0; i < SCENARIOS.length; i++) {
    const scenario = SCENARIOS[i];
    // Νέο, καθαρό sessionId — χωρίς ιστορικό από τη φάση 1
    const sessionId = `${EVAL_SESSION_PREFIX}fe-${runId}-after-${i}`;

    console.log(`  [${i + 1}/${SCENARIOS.length}] ${scenario.description}`);
    console.log(`  Ερώτηση: "${scenario.question}"`);
    console.log("  Bot (μετά feedback):");

    try {
      const chatResult = await retryAICall(
        () => ProcessUserMessage(sessionId, scenario.question),
        `After-${i + 1}`
      );

      const ragResults = await FindRelevantDocs(scenario.question, 3);
      const ragDocTitles = ragResults.map((r) => r.document.title);

      console.log(wrapText(chatResult.reply, "    "));

      // Έλεγχος αν τα keywords της διόρθωσης εμφανίζονται στη νέα απάντηση
      const answerLower = chatResult.reply.toLowerCase();
      const keywordsFound = scenario.keywords.filter((kw) =>
        answerLower.includes(kw.toLowerCase())
      );
      const improved = keywordsFound.length > 0;

      if (improved) {
        console.log(`  ✓ Keywords βρέθηκαν: ${keywordsFound.map((k) => `"${k}"`).join(", ")}`);
      } else {
        console.log(
          `  ✗ Keywords δεν βρέθηκαν: ${scenario.keywords.map((k) => `"${k}"`).join(", ")}`
        );
      }
      console.log();

      afterResults.push({
        scenario: scenario.description,
        question: scenario.question,
        reply: chatResult.reply,
        ragDocTitles,
        timestamp: new Date().toISOString(),
      });

      experimentResults.push({
        scenario: scenario.description,
        question: scenario.question,
        beforeReply: beforeResults[i].reply,
        afterReply: chatResult.reply,
        ragDocsBefore: beforeResults[i].ragDocTitles,
        ragDocsAfter: ragDocTitles,
        correction: scenario.correction,
        keywordsFound,
        improved,
      });
    } catch (error) {
      console.error(`  ✗ Σφάλμα: ${(error as Error).message}\n`);

      afterResults.push({
        scenario: scenario.description,
        question: scenario.question,
        reply: `ΣΦΑΛΜΑ: ${(error as Error).message}`,
        ragDocTitles: [],
        timestamp: new Date().toISOString(),
      });

      experimentResults.push({
        scenario: scenario.description,
        question: scenario.question,
        beforeReply: beforeResults[i].reply,
        afterReply: `ΣΦΑΛΜΑ: ${(error as Error).message}`,
        ragDocsBefore: beforeResults[i].ragDocTitles,
        ragDocsAfter: [],
        correction: scenario.correction,
        keywordsFound: [],
        improved: false,
      });
    }
  }

  // Αποθήκευση αποτελεσμάτων φάσης 3
  const afterPath = path.join(RESULTS_DIR, "feedback-experiment-after.json");
  fs.writeFileSync(
    afterPath,
    JSON.stringify({ runId, phase: "after", results: afterResults }, null, 2),
    "utf-8"
  );
  console.log(`  ✓ Αποθηκεύτηκε: ${afterPath}\n`);

  // ════════════════════════════════════════════════════════════════════════
  // ΑΝΑΦΟΡΑ — Σύνοψη πριν/μετά
  // ════════════════════════════════════════════════════════════════════════
  const totalImproved = experimentResults.filter((r) => r.improved).length;
  const total = SCENARIOS.length;
  const pct = Math.round((totalImproved / total) * 100);
  const now = new Date().toLocaleString("el-GR");

  // Δημιουργία Markdown αναφοράς
  let report = `# ShopEasy — Αποτελέσματα Πειράματος Feedback Loop

**Ημερομηνία:** ${now}
**Run ID:** ${runId}

---

## Σύνοψη

| Μέτρηση | Αποτέλεσμα |
|---------|-----------|
| Σύνολο σεναρίων | ${total} |
| Βελτιώθηκαν | **${totalImproved}/${total} (${pct}%)** |
| Δεν βελτιώθηκαν | ${total - totalImproved}/${total} |

---

## Λεπτομέρειες ανά Σενάριο

`;

  for (let i = 0; i < experimentResults.length; i++) {
    const r = experimentResults[i];
    const icon = r.improved ? "✓ ΒΕΛΤΙΩΘΗΚΕ" : "✗ ΔΕΝ ΒΕΛΤΙΩΘΗΚΕ";
    const keywordsDetail = r.improved
      ? `Keywords βρέθηκαν: ${r.keywordsFound.map((k) => `"${k}"`).join(", ")}`
      : `Αναμενόμενα keywords: ${SCENARIOS[i].keywords.map((k) => `"${k}"`).join(", ")} — δεν βρέθηκαν`;

    report += `### Σενάριο ${i + 1} — ${r.scenario}

**Ερώτηση:** ${r.question}

**Εγκεκριμένη Διόρθωση:**
> ${r.correction}

**Απάντηση ΠΡΙΝ το feedback:**
> ${r.beforeReply}

**Απάντηση ΜΕΤΑ το feedback:**
> ${r.afterReply}

**Αποτέλεσμα:** ${icon}
${keywordsDetail}

---

`;
  }

  report += `## Συμπέρασμα

${totalImproved === total
  ? `Ο bot ενσωμάτωσε **όλες τις ${total} εγκεκριμένες διορθώσεις** χωρίς επανεκπαίδευση.`
  : `Ο bot ενσωμάτωσε **${totalImproved}/${total}** διορθώσεις μέσω prompt injection.`}

Αυτό επιδεικνύει τη δυνατότητα προσαρμοστικής εκπαίδευσης του συστήματος
μέσω Human-in-the-Loop Feedback, χωρίς fine-tuning ή επανεκπαίδευση του LLM.

*Παράχθηκε αυτόματα από το feedback-experiment.ts — ShopEasy Thesis Evaluation Pipeline*
`;

  const reportPath = path.join(RESULTS_DIR, "feedback-experiment-report.md");
  fs.writeFileSync(reportPath, report, "utf-8");

  // Εκτύπωση τελικής σύνοψης
  console.log("\n" + "═".repeat(70));
  console.log("  ΑΠΟΤΕΛΕΣΜΑΤΑ ΠΕΙΡΑΜΑΤΟΣ FEEDBACK LOOP");
  console.log("═".repeat(70) + "\n");

  for (const r of experimentResults) {
    const icon = r.improved ? "✓" : "✗";
    console.log(`  [${icon}] ${r.scenario}`);
  }

  console.log();
  printLine();
  console.log(`\n  Σκορ: ${totalImproved}/${total} σενάρια βελτιώθηκαν (${pct}%)`);
  console.log(`  ✓ Αναφορά: ${reportPath}\n`);

  if (totalImproved === total) {
    console.log("  Ο bot ενσωμάτωσε ΟΛΕΣ τις εγκεκριμένες διορθώσεις.");
    console.log("  Ο μηχανισμός Human-in-the-Loop Feedback αποδείχθηκε πλήρως.");
  } else if (totalImproved > 0) {
    console.log(`  ${totalImproved}/${total} διορθώσεις ενσωματώθηκαν επιτυχώς.`);
  }

  console.log(
    "\n  Για καθαρισμό test δεδομένων από MongoDB:\n" +
    "    npx ts-node --transpile-only src/scripts/cleanup-test-data.ts\n"
  );
  console.log("═".repeat(70) + "\n");
}

// Εκτέλεση — σύνδεση, πείραμα, αποσύνδεση
RunFeedbackExperiment()
  .then(() => mongoose.disconnect())
  .catch((error) => {
    console.error("\nΚρίσιμο σφάλμα κατά το πείραμα:", error);
    process.exit(1);
  });
