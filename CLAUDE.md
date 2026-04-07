# CLAUDE.md — ShopEasy ChatBot

This file tells Claude Code exactly how to work on this project.
Read it fully before making any changes.

---

## 🗂️ Project Overview

**ShopEasy ChatBot** is an AI-powered customer support chatbot built as a university thesis project.

- **Frontend:** React (Vite)
- **Backend:** Node.js + Express
- **Database:** MongoDB (local via Docker for development, MongoDB Atlas M0 for demo)
- **AI:** Swappable provider — OpenRouter / Gemini / OpenAI
- **Embeddings:** Local model via `@xenova/transformers` (no cloud API needed)
- **Infrastructure:** Docker Compose (no production deployment — local/demo only)

The project implements two advanced features:
1. **RAG (Retrieval-Augmented Generation):** Before answering, the bot retrieves the most relevant entries from a knowledge base using vector similarity search.
2. **Feedback Loop (Human-in-the-Loop):** Users can rate bot answers. Approved corrections are injected back into the system prompt so the bot improves without retraining.

---

## 🚫 Scope Constraints

- **No production deployment.** This runs locally via `docker compose up` or directly with `npm run dev`. Do not add CI/CD pipelines, cloud deployment configs, or production build steps unless explicitly asked.
- **No authentication system.** The admin panel uses a simple hardcoded password. Do not build JWT, OAuth, or session-based auth.
- **No tests.** Do not generate unit/integration test files unless explicitly asked.
- **Keep dependencies minimal.** Don't add new npm packages without a clear reason.

---

## 📋 Rules That Apply to EVERY Change

These are non-negotiable. Follow them for every file you create or modify.

### 1. Comment everything in Greek

Every function, every file, every non-obvious block of logic must have a comment **in Greek** that explains:
- What it does
- Why it exists / why it's needed

Comments are not for you — they are for a student with no programming background who needs to understand and present this code.

**Good comment example:**
```js
// getEmbedding: Μετατρέπει ένα κείμενο σε αριθμητικό διάνυσμα (embedding).
// Το διάνυσμα αυτό επιτρέπει στο σύστημα να βρει σημασιολογικά παρόμοια κείμενα,
// π.χ. "θέλω επιστροφή" ≈ "πώς γυρίζω ένα προϊόν" ακόμα και αν οι λέξεις διαφέρουν.
```

**Bad comment (too vague):**
```js
// handles the embedding
```

Every new file must start with a multi-line comment block explaining:
- What the file is
- Why it exists in the system
- What other files it depends on / interacts with

### 2. Update README.md when relevant

After every change that adds, removes, or modifies user-facing behaviour or setup steps, update `README.md` to reflect it. Specifically:
- New feature → add a 1–3 sentence description under the relevant section
- New script to run → add it to the "How to run" section
- New environment variable → add it to the `.env.example` section in README
- New API endpoint → add it to the API reference section

If a change is purely internal (refactor, bug fix, comment update) and nothing visible changes, README does not need updating — but use judgment.

### 3. Update TODO.md

After completing a task from `TODO.md`:
- Check the corresponding checkbox: `- [x]`
- If something was done differently from the plan, add a short note below the item:
  ```
  - [x] Create ragService.js
    > Note: Used `$text` search as primary method since Atlas was not available during development.
  ```

---

## 🗃️ Project Structure

```
shopeasy-chatbot/
├── backend/
│   ├── src/
│   │   ├── models/          # Mongoose schemas (Conversation, Feedback, KnowledgeBase)
│   │   ├── routes/          # Express route handlers (chat, feedback, admin)
│   │   ├── services/        # Business logic (chatService, ragService, embeddingService, feedbackEngine)
│   │   ├── scripts/         # One-off scripts: seedKnowledge.js, evaluate.js
│   │   └── index.js         # App entry point
│   ├── .env                 # Local environment variables (not committed)
│   ├── .env.example         # Template for environment variables (committed)
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── components/      # React components (ChatWindow, MessageBubble, AdminPanel, etc.)
│   │   ├── pages/           # Route-level pages
│   │   └── main.jsx         # React entry point
│   └── package.json
├── docs/
│   └── architecture.md      # System diagrams and explanations
├── docker-compose.yml        # Runs backend + MongoDB + Mongo Express
├── README.md
└── CLAUDE.md                 # This file
```

---

## 🔑 Key Files and What They Do

| File | Purpose |
|---|---|
| `backend/src/services/chatService.js` | Orchestrates the full chat flow: RAG lookup → build prompt → call AI → save → return |
| `backend/src/services/ragService.js` | Finds the most relevant knowledge base documents for a given user message |
| `backend/src/services/embeddingService.js` | Loads the local ML model and converts text to numerical vectors |
| `backend/src/services/feedbackEngine.js` | Converts approved feedback into few-shot examples injected into the system prompt |
| `backend/src/models/KnowledgeBase.js` | MongoDB schema for knowledge base entries (title, content, category, embedding) |
| `backend/src/models/Feedback.js` | MongoDB schema for user ratings and corrections |
| `backend/src/scripts/seedKnowledge.js` | One-time script to populate the knowledge base with initial FAQ entries |
| `frontend/src/components/AdminPanel` | React admin UI: dashboard, knowledge CRUD, feedback review |

---

## 🌍 Environment Variables

All secrets and config live in `backend/.env` (never committed). The template is `backend/.env.example`.

Key variables:
```
MONGODB_URI=          # MongoDB connection string (local or Atlas)
AI_PROVIDER=          # "openrouter" | "gemini" | "openai"
OPENROUTER_API_KEY=   # API key for OpenRouter
GEMINI_API_KEY=       # API key for Gemini
OPENAI_API_KEY=       # API key for OpenAI
ADMIN_PASSWORD=       # Simple password for the /admin route
```

When you add a new environment variable:
1. Add it to `.env.example` with a comment explaining what it is
2. Add it to the README.md environment variables section
3. Never hardcode secrets in source files

---

## 🏃 How to Run (Development)

```bash
# Start MongoDB + Mongo Express via Docker
docker compose up -d mongodb mongo-express

# Backend
cd backend
npm install
npm run dev   # runs on http://localhost:3001

# Frontend
cd frontend
npm install
npm run dev   # runs on http://localhost:5173

# Seed the knowledge base (run once)
cd backend
node src/scripts/seedKnowledge.js
```

Or run everything with Docker:
```bash
docker compose up
```

---

## 🧠 RAG Flow (How the Bot Answers)

When a user sends a message, this is what happens step by step:

1. **Embed the question** — `embeddingService.getEmbedding(userMessage)` converts the question into a 384-number vector
2. **Search the knowledge base** — `ragService.findRelevantDocs()` uses vector similarity (cosine) to find the 3 most relevant FAQ entries
3. **Build the system prompt** — The relevant docs + any approved feedback corrections are injected into the AI's instructions
4. **Call the AI** — The message + enriched prompt are sent to the configured AI provider
5. **Save + return** — The response is saved to MongoDB and returned to the frontend

---

## 💬 Feedback Loop (How the Bot Improves)

1. User clicks 👎 on a bot reply
2. An optional text input appears: "What would the correct answer have been?"
3. The feedback is saved to MongoDB with `status: "pending"`
4. An admin reviews it in the admin panel and clicks "Approve" or "Reject"
5. Approved corrections are fetched by `feedbackEngine.getGoldenRules()` and injected into every future system prompt as few-shot examples

---

## 📝 Code Style

- **Language:** JavaScript (no TypeScript)
- **Comments:** Greek (mandatory — see Rule 1 above)
- **Variable/function names:** English (camelCase)
- **File names:** camelCase for services/models, PascalCase for React components
- **Async:** Use `async/await`, not `.then()` chains
- **Error handling:** Every `async` function that calls an external service (DB, AI API) must have a `try/catch` with a meaningful error log
- **No magic numbers:** Use named constants with a comment explaining their value
  ```js
  const EMBEDDING_DIMENSIONS = 384; // Διαστάσεις του all-MiniLM-L6-v2 μοντέλου
  const MAX_RAG_RESULTS = 3;        // Μέγιστος αριθμός εγγράφων που επιστρέφει το RAG
  ```

---

## ⚠️ Common Pitfalls

- **`$vectorSearch` only works on MongoDB Atlas**, not on a local MongoDB instance. The `ragService` must detect which is being used and fall back to `$text` search for local development.
- **The embedding model downloads ~80MB on first run.** The Docker volume for the backend must cache this so it doesn't re-download on every container restart.
- **Embeddings must be re-generated** whenever a knowledge base entry's `content` is updated. The admin panel's edit endpoint must trigger `embeddingService.getEmbedding()` again.
- **The feedback injection must be capped** (e.g. max 5 golden rules, max 5 negative examples) to avoid bloating the system prompt and hitting token limits.