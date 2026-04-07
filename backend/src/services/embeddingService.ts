/*
 * embeddingService.ts
 *
 * Τι κάνει αυτό το αρχείο:
 *   Φορτώνει ένα τοπικό μοντέλο μηχανικής μάθησης (all-MiniLM-L6-v2) και
 *   μετατρέπει κείμενα σε αριθμητικά διανύσματα (embeddings).
 *
 * Γιατί χρειάζεται:
 *   Το RAG σύστημα χρειάζεται να συγκρίνει "σημαντολογικά" κείμενα — δηλαδή
 *   να βρει αν δύο προτάσεις έχουν παρόμοιο νόημα ακόμα και αν χρησιμοποιούν
 *   διαφορετικές λέξεις. Τα embeddings κάνουν ακριβώς αυτό: μετατρέπουν το
 *   νόημα ενός κειμένου σε 384 αριθμούς ώστε να μπορεί να συγκριθεί μαθηματικά.
 *
 * Εξαρτήσεις:
 *   - @xenova/transformers: η βιβλιοθήκη που τρέχει το ML μοντέλο τοπικά
 *   - Χρησιμοποιείται από: ragService.ts, seedKnowledge.ts
 */

// Αριθμός διαστάσεων του μοντέλου all-MiniLM-L6-v2.
// Κάθε κείμενο μετατρέπεται σε ακριβώς 384 αριθμούς.
const EMBEDDING_DIMENSIONS = 384;

// Όνομα του μοντέλου που χρησιμοποιούμε από το Hugging Face.
// Χρησιμοποιούμε το paraphrase-multilingual-MiniLM-L12-v2 αντί για all-MiniLM-L6-v2
// γιατί υποστηρίζει 50+ γλώσσες (συμπεριλαμβανομένων Ελληνικών και Αγγλικών).
// Έτσι ερωτήσεις στα Αγγλικά βρίσκουν σωστά FAQs γραμμένα στα Ελληνικά.
// Παράγει επίσης 384-διάστατα embeddings — ο Atlas index δεν χρειάζεται αλλαγή.
const MODEL_NAME = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";

// Singleton: το pipeline φορτώνεται μόνο μία φορά και επαναχρησιμοποιείται.
// Αυτό αποφεύγει την πολύ αργή επανεκκίνηση του μοντέλου σε κάθε request.
let pipelineInstance: any = null;

// Cache στη μνήμη: αποθηκεύει embeddings που έχουν ήδη υπολογιστεί.
// Κλειδί = το κείμενο, τιμή = ο πίνακας με τα 384 νούμερα.
// Αποφεύγει επανάληψη υπολογισμού για το ίδιο κείμενο (π.χ. ίδια ερώτηση
// που στέλνεται πολλές φορές).
const embeddingCache = new Map<string, number[]>();

/**
 * GetPipeline: Επιστρέφει το pipeline του μοντέλου, φορτώνοντάς το αν δεν
 * έχει φορτωθεί ακόμα (singleton pattern).
 *
 * Γιατί χρησιμοποιούμε dynamic import:
 *   Το @xenova/transformers είναι ESM module, ενώ το project χρησιμοποιεί
 *   CommonJS. Το dynamic import() επιτρέπει τη χρήση ESM modules σε CJS κώδικα.
 */
async function GetPipeline(): Promise<any> {
  if (pipelineInstance) {
    // Το μοντέλο έχει ήδη φορτωθεί — επιστροφή άμεσα
    return pipelineInstance;
  }

  // Πρώτη φορά: φόρτωση του μοντέλου από τοπική cache ή λήψη από internet
  console.log(`[EmbeddingService] Φόρτωση μοντέλου "${MODEL_NAME}"...`);
  console.log("[EmbeddingService] Η πρώτη φόρτωση μπορεί να πάρει λίγα λεπτά (~80MB λήψη).");

  // Dynamic import για ESM compatibility.
  // Χρησιμοποιούμε Function() για να αποτρέψουμε το TypeScript compiler να μετατρέψει
  // το import() σε require() (το οποίο δεν λειτουργεί με ESM packages).
  // Αυτή η τεχνική "κρύβει" το import από τον compiler και το αφήνει στο Node.js runtime.
  const { pipeline } = await (new Function('return import("@xenova/transformers")')() as Promise<any>);

  // Δημιουργία pipeline για feature extraction (= παραγωγή embeddings)
  pipelineInstance = await pipeline("feature-extraction", MODEL_NAME);

  console.log(`[EmbeddingService] Μοντέλο φορτώθηκε επιτυχώς. Διαστάσεις: ${EMBEDDING_DIMENSIONS}`);
  return pipelineInstance;
}

/**
 * GetEmbedding: Μετατρέπει ένα κείμενο σε αριθμητικό διάνυσμα (embedding).
 *
 * Τι είναι το embedding:
 *   Ένας πίνακας από 384 αριθμούς που αναπαριστά το "νόημα" του κειμένου.
 *   Κείμενα με παρόμοιο νόημα έχουν παρόμοια διανύσματα (μικρή "cosine distance").
 *   Παράδειγμα: "θέλω επιστροφή" ≈ "πώς επιστρέφω ένα προϊόν" ακόμα αν
 *   οι λέξεις είναι διαφορετικές.
 *
 * Τι είναι το mean pooling:
 *   Το μοντέλο παράγει ένα διάνυσμα για κάθε λέξη. Παίρνουμε τον μέσο όρο
 *   όλων των λέξεων ώστε να πάρουμε ΈΝΑ διάνυσμα για ολόκληρη την πρόταση.
 *
 * @param text - Το κείμενο που θέλουμε να μετατρέψουμε
 * @returns Πίνακας από 384 αριθμούς (Float32Array → number[])
 */
export async function GetEmbedding(text: string): Promise<number[]> {
  // Ελέγχουμε αν έχουμε ήδη υπολογίσει το embedding για αυτό το κείμενο
  const cached = embeddingCache.get(text);
  if (cached) {
    return cached;
  }

  try {
    const extractor = await GetPipeline();

    // Εκτέλεση του μοντέλου με mean pooling και normalization.
    // pooling: "mean" = μέσος όρος όλων των token embeddings
    // normalize: true = τα νούμερα κλιμακώνονται ώστε το διάνυσμα να έχει μήκος 1
    //            (απαραίτητο για cosine similarity)
    const output = await extractor(text, { pooling: "mean", normalize: true });

    // Μετατροπή από Float32Array (αποτέλεσμα μοντέλου) σε κανονικό JS array
    const embedding: number[] = Array.from(output.data as Float32Array);

    // Αποθήκευση στη cache για μελλοντική χρήση
    embeddingCache.set(text, embedding);

    return embedding;
  } catch (error) {
    console.error("[EmbeddingService] Σφάλμα κατά τον υπολογισμό embedding:", error);
    throw error;
  }
}

/**
 * WarmUp: Φορτώνει το μοντέλο εκ των προτέρων κατά την εκκίνηση του server.
 *
 * Γιατί χρειάζεται:
 *   Αν δεν προφορτώσουμε το μοντέλο, το πρώτο request του χρήστη θα περιμένει
 *   αρκετά δευτερόλεπτα (ή λεπτά αν κατεβαίνει για πρώτη φορά). Με το WarmUp,
 *   αυτή η καθυστέρηση γίνεται κατά την εκκίνηση του server και όχι κατά τη
 *   διάρκεια της πρώτης συνομιλίας.
 */
export async function WarmUp(): Promise<void> {
  try {
    await GetPipeline();
    console.log("[EmbeddingService] Warm-up ολοκληρώθηκε — το μοντέλο είναι έτοιμο.");
  } catch (error) {
    // Δεν κάνουμε crash τον server αν αποτύχει το warm-up.
    // Το μοντέλο θα φορτωθεί στο πρώτο πραγματικό request.
    console.warn("[EmbeddingService] Αδυναμία warm-up μοντέλου:", error);
  }
}

// Εξαγωγή σταθεράς για χρήση σε άλλα αρχεία (π.χ. seedKnowledge, KnowledgeBase schema)
export { EMBEDDING_DIMENSIONS };
