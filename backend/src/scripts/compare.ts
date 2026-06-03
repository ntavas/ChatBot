/*
 * compare.ts
 *
 * Τι κάνει αυτό το script:
 *   Διαβάζει τα δύο βαθμολογημένα CSV αρχεία (results-full-chat.csv και
 *   results-baseline.csv) αφού ο αξιολογητής έχει συμπληρώσει τη στήλη
 *   my_grade (1=σωστό, 0=λάθος) και υπολογίζει:
 *   - Ακρίβεια bot με RAG (full-chat)
 *   - Ακρίβεια bot χωρίς RAG (baseline)
 *   - Μείωση παραισθήσεων (hallucination reduction)
 *   - Ανάλυση ανά κατηγορία ερώτησης
 *
 * Γιατί χρειάζεται:
 *   Παράγει τους πίνακες σύγκρισης για το Κεφάλαιο 7 (Αξιολόγηση)
 *   της πτυχιακής εργασίας, έτοιμους για copy-paste στο DOCX.
 *
 * Πώς να το τρέξεις:
 *   cd backend
 *   npx ts-node --transpile-only src/scripts/compare.ts
 *   # Παράγει: evaluation-results/comparison-report.md
 *
 * Προαπαιτούμενα:
 *   Πρέπει να έχεις τρέξει πρώτα:
 *     npx ts-node --transpile-only src/scripts/evaluate.ts --mode=full-chat
 *     npx ts-node --transpile-only src/scripts/evaluate.ts --mode=baseline
 *   και να έχεις συμπληρώσει τη στήλη my_grade σε κάθε αρχείο.
 *
 * Εξαρτήσεις:
 *   - fs, path (Node.js built-ins)
 *   - evaluation-results/results-full-chat.csv (βαθμολογημένο)
 *   - evaluation-results/results-baseline.csv  (βαθμολογημένο)
 */

import fs from "fs";
import path from "path";

// ─────────────────────────────────────────────────────────────────────────────
// Σταθερές
// ─────────────────────────────────────────────────────────────────────────────

const RESULTS_DIR = path.join(__dirname, "../../evaluation-results");
const FULL_CHAT_CSV = path.join(RESULTS_DIR, "results-full-chat.csv");
const BASELINE_CSV = path.join(RESULTS_DIR, "results-baseline.csv");
const REPORT_PATH = path.join(RESULTS_DIR, "comparison-report.md");

// Ελάχιστος αριθμός βαθμολογημένων γραμμών για αξιόπιστα αποτελέσματα
const MIN_GRADED_ROWS = 20;

// ─────────────────────────────────────────────────────────────────────────────
// Τύποι
// ─────────────────────────────────────────────────────────────────────────────

// Μια βαθμολογημένη γραμμή από CSV
interface GradedRow {
  id: string;
  category: string;
  question: string;
  bot_response: string;
  rag_docs_used: string;
  my_grade: string;  // "1" = σωστό, "0" = λάθος, "" = αβαθμολόγητο
  notes: string;
}

// Συνολικά αποτελέσματα για ένα CSV αρχείο
interface EvalSummary {
  fileName: string;
  totalRows: number;
  totalGraded: number;
  correct: number;
  incorrect: number;
  accuracy: number;
  byCategory: Record<string, { total: number; correct: number; accuracy: number }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Ανάλυση CSV
//
// Χρησιμοποιεί χειροποίητο parser που χειρίζεται:
// - Πεδία σε εισαγωγικά (bot responses με κόμματα)
// - Multiline πεδία (bot responses με αλλαγές γραμμής)
// - Εσωτερικά εισαγωγικά που διπλασιάζονται ("")
// ─────────────────────────────────────────────────────────────────────────────

// Αναλύει ένα αρχείο CSV που μπορεί να έχει multiline quoted fields.
// Επεξεργάζεται ολόκληρο το αρχείο σαν ένα string (όχι γραμμή-γραμμή)
// για να χειριστεί σωστά πεδία που περιέχουν αλλαγές γραμμής.
function parseCSV(content: string): string[][] {
  const records: string[][] = [];
  let currentRecord: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;

  while (i < content.length) {
    const ch = content[i];

    if (inQuotes) {
      if (ch === '"' && content[i + 1] === '"') {
        // Διπλό εισαγωγικό εντός πεδίου — αντιπροσωπεύει ένα εισαγωγικό
        currentField += '"';
        i += 2;
      } else if (ch === '"') {
        // Κλείσιμο εισαγωγικού
        inQuotes = false;
        i++;
      } else {
        currentField += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        // Άνοιγμα εισαγωγικού
        inQuotes = true;
        i++;
      } else if (ch === ",") {
        // Διαχωριστής πεδίου
        currentRecord.push(currentField);
        currentField = "";
        i++;
      } else if (ch === "\n" || (ch === "\r" && content[i + 1] === "\n")) {
        // Τέλος εγγραφής
        currentRecord.push(currentField);
        if (currentRecord.length > 1 || currentRecord[0] !== "") {
          records.push(currentRecord);
        }
        currentRecord = [];
        currentField = "";
        i += ch === "\r" ? 2 : 1;
      } else if (ch === "\r") {
        // Μεμονωμένο \r — αγνοείται
        i++;
      } else {
        currentField += ch;
        i++;
      }
    }
  }

  // Τελευταίο πεδίο/εγγραφή χωρίς newline στο τέλος
  if (currentField || currentRecord.length > 0) {
    currentRecord.push(currentField);
    if (currentRecord.length > 1 || currentRecord[0] !== "") {
      records.push(currentRecord);
    }
  }

  return records;
}

// Φορτώνει και αναλύει ένα CSV αρχείο αξιολόγησης
function loadCSV(filePath: string): GradedRow[] {
  if (!fs.existsSync(filePath)) {
    const fileName = path.basename(filePath);
    console.error(`\n  ✗ Αρχείο δεν βρέθηκε: ${filePath}`);
    console.error(`    Τρέξε πρώτα το evaluate.ts για να το δημιουργήσεις:`);
    if (fileName.includes("full-chat")) {
      console.error("    npx ts-node --transpile-only src/scripts/evaluate.ts --mode=full-chat");
    } else {
      console.error("    npx ts-node --transpile-only src/scripts/evaluate.ts --mode=baseline");
    }
    console.error("    Μετά συμπλήρωσε τη στήλη my_grade (1/0) και τρέξε ξανά το compare.ts\n");
    process.exit(1);
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const records = parseCSV(content);

  // Παράλειψη επικεφαλίδας
  const rows = records.slice(1);

  return rows
    .filter((r) => r.length >= 7)
    .map((r) => ({
      id: r[0].trim(),
      category: r[1].trim(),
      question: r[2].trim(),
      bot_response: r[3].trim(),
      rag_docs_used: r[4].trim(),
      my_grade: r[5].trim(),
      notes: r[6]?.trim() ?? "",
    }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Υπολογισμός μετρικών
// ─────────────────────────────────────────────────────────────────────────────

// Υπολογίζει accuracy και per-category breakdown για ένα σύνολο γραμμών
function computeSummary(rows: GradedRow[], fileName: string): EvalSummary {
  const graded = rows.filter((r) => r.my_grade === "1" || r.my_grade === "0");
  const correct = graded.filter((r) => r.my_grade === "1").length;
  const incorrect = graded.filter((r) => r.my_grade === "0").length;

  // Υπολογισμός ανά κατηγορία
  const byCategory: EvalSummary["byCategory"] = {};
  const categories = [...new Set(graded.map((r) => r.category))];

  for (const cat of categories) {
    const catRows = graded.filter((r) => r.category === cat);
    const catCorrect = catRows.filter((r) => r.my_grade === "1").length;
    byCategory[cat] = {
      total: catRows.length,
      correct: catCorrect,
      accuracy: catRows.length > 0 ? (catCorrect / catRows.length) * 100 : 0,
    };
  }

  return {
    fileName,
    totalRows: rows.length,
    totalGraded: graded.length,
    correct,
    incorrect,
    accuracy: graded.length > 0 ? (correct / graded.length) * 100 : 0,
    byCategory,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Δημιουργία αναφοράς Markdown
// ─────────────────────────────────────────────────────────────────────────────

function buildReport(
  fullChatRows: GradedRow[],
  baselineRows: GradedRow[],
  fullChat: EvalSummary,
  baseline: EvalSummary
): string {
  const now = new Date().toLocaleString("el-GR");

  // Υπολογισμός hallucination reduction:
  // Ερωτήσεις που ήταν λάθος στο baseline αλλά σωστές στο full-chat
  const baselineMap = new Map(baselineRows.map((r) => [r.id, r.my_grade]));
  const fullChatMap = new Map(fullChatRows.map((r) => [r.id, r.my_grade]));

  let improvedCount = 0;
  let baselineWrong = 0;

  for (const [id, baselineGrade] of baselineMap) {
    if (baselineGrade === "0") {
      baselineWrong++;
      if (fullChatMap.get(id) === "1") {
        improvedCount++;
      }
    }
  }

  const hallucinationReduction =
    baselineWrong > 0 ? (improvedCount / baselineWrong) * 100 : 0;

  const ragGain = fullChat.accuracy - baseline.accuracy;

  // Όλες οι κατηγορίες και από τα δύο CSVs
  const allCategories = [
    ...new Set([
      ...Object.keys(fullChat.byCategory),
      ...Object.keys(baseline.byCategory),
    ]),
  ].sort();

  // Πίνακας per-question diff (σύγκριση αποτελεσμάτων ανά ερώτηση)
  const allIds = [...new Set([...fullChatRows.map((r) => r.id), ...baselineRows.map((r) => r.id)])].sort();

  let report = `# ShopEasy — Σύγκριση Αξιολόγησης RAG vs Baseline

**Ημερομηνία:** ${now}

---

## 1. Συνολική Ακρίβεια

| Μέτρηση | RAG (full-chat) | Baseline (χωρίς RAG) | Διαφορά |
|---------|-----------------|----------------------|---------|
| Ακρίβεια | **${fullChat.accuracy.toFixed(1)}%** | ${baseline.accuracy.toFixed(1)}% | ${ragGain >= 0 ? "+" : ""}${ragGain.toFixed(1)}% |
| Σωστές απαντήσεις | ${fullChat.correct}/${fullChat.totalGraded} | ${baseline.correct}/${baseline.totalGraded} | — |
| Μείωση παραισθήσεων | — | — | **${hallucinationReduction.toFixed(1)}%** |

> **Σημείωση:** Ακρίβεια = (σωστές απαντήσεις) / (βαθμολογημένες ερωτήσεις). Αβαθμολόγητες γραμμές εξαιρέθηκαν.

---

## 2. Ακρίβεια ανά Κατηγορία

| Κατηγορία | RAG Σωστές | RAG Acc. | Baseline Σωστές | Baseline Acc. | Βελτίωση |
|-----------|-----------|----------|-----------------|---------------|----------|
`;

  for (const cat of allCategories) {
    const fc = fullChat.byCategory[cat];
    const bl = baseline.byCategory[cat];
    const fcAcc = fc ? `${fc.accuracy.toFixed(1)}%` : "—";
    const blAcc = bl ? `${bl.accuracy.toFixed(1)}%` : "—";
    const fcCorrect = fc ? `${fc.correct}/${fc.total}` : "—";
    const blCorrect = bl ? `${bl.correct}/${bl.total}` : "—";
    const improvement =
      fc && bl ? `${(fc.accuracy - bl.accuracy >= 0 ? "+" : "")}${(fc.accuracy - bl.accuracy).toFixed(1)}%` : "—";
    report += `| ${cat} | ${fcCorrect} | ${fcAcc} | ${blCorrect} | ${blAcc} | ${improvement} |\n`;
  }

  report += `
---

## 3. Σύγκριση ανά Ερώτηση

| ID | Κατηγορία | RAG Grade | Baseline Grade | Αποτέλεσμα |
|----|-----------|-----------|----------------|-----------|
`;

  for (const id of allIds) {
    const fcRow = fullChatRows.find((r) => r.id === id);
    const blRow = baselineRows.find((r) => r.id === id);
    const fcGrade = fcRow?.my_grade ?? "—";
    const blGrade = blRow?.my_grade ?? "—";
    const category = fcRow?.category ?? blRow?.category ?? "—";

    let outcome = "—";
    if (fcGrade === "1" && blGrade === "0") outcome = "✓ Βελτίωση";
    else if (fcGrade === "0" && blGrade === "1") outcome = "✗ Παλινδρόμηση";
    else if (fcGrade === "1" && blGrade === "1") outcome = "= Και οι δύο σωστοί";
    else if (fcGrade === "0" && blGrade === "0") outcome = "= Και οι δύο λάθος";
    else outcome = "Αβαθμολόγητο";

    report += `| ${id} | ${category} | ${fcGrade} | ${blGrade} | ${outcome} |\n`;
  }

  report += `
---

## 4. Σύνοψη

- **Βελτιωμένες ερωτήσεις** (λάθος baseline → σωστό RAG): **${improvedCount}**
- **Παλινδρομήσεις** (σωστό baseline → λάθος RAG): **${allIds.filter((id) => fullChatMap.get(id) === "0" && baselineMap.get(id) === "1").length}**
- **Hallucination reduction**: ${hallucinationReduction.toFixed(1)}% (από ${baselineWrong} λανθασμένες baseline απαντήσεις, ${improvedCount} διορθώθηκαν με RAG)

*Παράχθηκε αυτόματα από το compare.ts — ShopEasy Thesis Evaluation Pipeline*
`;

  return report;
}

// ─────────────────────────────────────────────────────────────────────────────
// Κύρια ροή
// ─────────────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  console.log("\n" + "═".repeat(70));
  console.log("  ShopEasy — Σύγκριση RAG vs Baseline");
  console.log("═".repeat(70) + "\n");

  // Φόρτωση CSV αρχείων
  console.log("  Φόρτωση αρχείων...");
  const fullChatRows = loadCSV(FULL_CHAT_CSV);
  const baselineRows = loadCSV(BASELINE_CSV);
  console.log(`  ✓ full-chat: ${fullChatRows.length} γραμμές`);
  console.log(`  ✓ baseline:  ${baselineRows.length} γραμμές\n`);

  // Υπολογισμός μετρικών
  const fullChatSummary = computeSummary(fullChatRows, "results-full-chat.csv");
  const baselineSummary = computeSummary(baselineRows, "results-baseline.csv");

  // Προειδοποίηση αν λίγες γραμμές είναι βαθμολογημένες
  if (fullChatSummary.totalGraded < MIN_GRADED_ROWS) {
    console.warn(
      `  ⚠ Μόνο ${fullChatSummary.totalGraded} βαθμολογημένες γραμμές στο full-chat CSV.`
    );
    console.warn(`    Συμπλήρωσε my_grade (1/0) σε τουλάχιστον ${MIN_GRADED_ROWS} γραμμές.\n`);
  }
  if (baselineSummary.totalGraded < MIN_GRADED_ROWS) {
    console.warn(
      `  ⚠ Μόνο ${baselineSummary.totalGraded} βαθμολογημένες γραμμές στο baseline CSV.`
    );
    console.warn(`    Συμπλήρωσε my_grade (1/0) σε τουλάχιστον ${MIN_GRADED_ROWS} γραμμές.\n`);
  }

  // Εκτύπωση σύνοψης
  console.log("  Αποτελέσματα:");
  console.log(`    RAG (full-chat):  ${fullChatSummary.accuracy.toFixed(1)}% (${fullChatSummary.correct}/${fullChatSummary.totalGraded})`);
  console.log(`    Baseline:         ${baselineSummary.accuracy.toFixed(1)}% (${baselineSummary.correct}/${baselineSummary.totalGraded})`);
  console.log(`    Βελτίωση:         +${(fullChatSummary.accuracy - baselineSummary.accuracy).toFixed(1)}%\n`);

  // Δημιουργία και αποθήκευση αναφοράς
  const report = buildReport(fullChatRows, baselineRows, fullChatSummary, baselineSummary);

  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, report, "utf-8");
  console.log(`  ✓ Αναφορά αποθηκεύτηκε: ${REPORT_PATH}`);
  console.log("    Άνοιξε το αρχείο για να δεις τους πίνακες σύγκρισης.\n");
}

main().catch((error) => {
  console.error("\nΣφάλμα κατά τη σύγκριση:", error);
  process.exit(1);
});
