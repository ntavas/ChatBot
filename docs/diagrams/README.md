# Διαγράμματα Πτυχιακής — ShopEasy ChatBot

Αυτός ο φάκελος περιέχει έξι PlantUML διαγράμματα για την πτυχιακή εργασία
**"ShopEasy ChatBot: AI-Powered Customer Support με RAG και Human-in-the-Loop Feedback"**.

---

## Αντιστοίχιση Διαγραμμάτων με Κεφάλαια

| Αρχείο | Τύπος | Κεφάλαιο | Περιγραφή |
|--------|-------|-----------|-----------|
| `01-architecture.puml` | Component | 5.1 | Τριεπίπεδη αρχιτεκτονική συστήματος |
| `02-chat-sequence.puml` | Sequence | 5.5 / 6.3 | Ροή επεξεργασίας αιτήματος chat (6 βήματα) |
| `03-feedback-loop.puml` | Sequence | 5.5 / 6.4 | Κύκλος Human-in-the-Loop feedback |
| `04-data-schema.puml` | Class/ER | 5.3 | Σχήματα δεδομένων MongoDB |
| `05-feedback-state.puml` | State | 5.5 / 6.4 | Κύκλος ζωής feedback document |
| `06-rag-vs-baseline.puml` | Component | 7.4 | Σύγκριση RAG Pipeline έναντι Baseline |

---

## Προτεινόμενες Λεζάντες (Captions)

```
Διάγραμμα 5.1:  Τριεπίπεδη αρχιτεκτονική του συστήματος ShopEasy ChatBot.
                 Το σύστημα διαχωρίζεται στο Επίπεδο Παρουσίασης (React),
                 το Επίπεδο Εφαρμογής (Node.js/Express) και το Επίπεδο
                 Δεδομένων (MongoDB Atlas, embedding μοντέλο, AI provider).

Διάγραμμα 5.2:  Ακολουθία επεξεργασίας αιτήματος chat. Τα έξι βήματα
                 περιλαμβάνουν φόρτωση ιστορικού, RAG ανάκτηση με cosine
                 similarity (top-3, MIN_SCORE=0.5), δόμηση δυναμικού
                 system prompt και κλήση AI provider.

Διάγραμμα 5.3:  Κύκλος Human-in-the-Loop ανατροφοδότησης. Φάση Α:
                 υποβολή αρνητικής αξιολόγησης και έγκριση από τον
                 διαχειριστή. Φάση Β: αυτόματη έγχυση εγκεκριμένων
                 διορθώσεων ως few-shot παραδείγματα σε μελλοντικά
                 αιτήματα, χωρίς επανεκπαίδευση του μοντέλου.

Διάγραμμα 5.4:  Σχήματα δεδομένων των τριών collections της MongoDB:
                 conversations (ιστορικό συνομιλιών), feedbacks
                 (αξιολογήσεις χρηστών) και knowledgebases (FAQ + 384-dim
                 vector embeddings για $vectorSearch).

Διάγραμμα 5.5:  Μηχανή καταστάσεων feedback document. Ένα feedback
                 δημιουργείται ως "pending", μεταβαίνει σε "approved"
                 (golden rule, max 5) ή "rejected", και παραμένει στη
                 βάση για ιστορικό αρχείο.

Διάγραμμα 7.1:  Σύγκριση Baseline (LLM χωρίς context) έναντι Full-chat
                 RAG Pipeline. Το RAG προσθέτει τα βήματα embedding,
                 vector search και context injection, επιτυγχάνοντας
                 βελτίωση correctness κατά +53,3 ποσοστιαίες μονάδες.
```

---

## Export σε PNG

### Μέθοδος 1 — PlantUML CLI (Συνιστάται)

Απαιτεί Java (≥ 8) και το `plantuml.jar`.

```bash
# Export ένα διάγραμμα
java -jar plantuml.jar -tpng 01-architecture.puml

# Export όλα τα διαγράμματα του φακέλου
java -jar plantuml.jar -tpng *.puml

# Export με υψηλή ανάλυση (200 DPI) — ιδανικό για Word
java -jar plantuml.jar -tpng -Sdpi=200 *.puml
```

Λήψη PlantUML: https://plantuml.com/download

### Μέθοδος 2 — Online Server (Χωρίς εγκατάσταση)

1. Άνοιξε το https://www.plantuml.com/plantuml/uml/
2. Επικόλλησε τον κώδικα από κάθε `.puml` αρχείο
3. Κλίκ "Submit" → δεξί κλικ στην εικόνα → "Αποθήκευση ως..."

### Μέθοδος 3 — VS Code Extension

Εγκατάστησε το extension **"PlantUML"** (jebbs.plantuml) και πάτα
`Alt+D` για preview ή `Ctrl+Shift+P` → "PlantUML: Export Current Diagram".

---

## Εισαγωγή στο Word

1. Κάνε export τα PNG σε ανάλυση ≥ 150 DPI (`-Sdpi=150` ή `-Sdpi=200`)
2. Στο Word: **Εισαγωγή → Εικόνα → Αυτή η συσκευή**
3. Επίλεξε το PNG και κλίκ **Εισαγωγή**
4. Πρόσθεσε λεζάντα: κλικ στην εικόνα → **Αναφορές → Εισαγωγή Λεζάντας**
5. Χρησιμοποίησε τις προτεινόμενες λεζάντες από τον παραπάνω πίνακα

**Συμβουλή:** Ορίζοντας πλάτος εικόνας στο 90% της στήλης κειμένου
εξασφαλίζεις ομοιόμορφη εμφάνιση και στο PDF export.
