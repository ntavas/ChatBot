# Implementation Plan
Track progress here. Claude Code can check off boxes as tasks are completed.
Work through phases in order — do not skip ahead.

---

## Phase 1 — Project Setup
> Goal: Empty project that compiles and runs inside Docker with no errors.

- [x] Create root `docker-compose.yml` with `backend` and `mongo` services
- [x] Create `/backend` folder with `package.json`, `tsconfig.json`, `Dockerfile`
- [x] Install backend dependencies: `express`, `mongoose`, `openai`, `uuid`, `dotenv`, `cors`
- [x] Install dev dependencies: `typescript`, `ts-node-dev`, `@types/*`
- [x] Create `src/server.ts` — starts Express on `PORT` from env
- [x] Create `src/config/env.ts` — reads and validates all `.env` variables
- [x] Create `src/config/database.ts` — connects to MongoDB
- [x] Create `src/config/openai.ts` — deleted; replaced by AI provider abstraction (see below)
- [x] Create `.env` and `.env.example`
- [x] Create `.gitignore` — includes `.env`, `node_modules`, `dist`
- [x] Verify: `docker-compose up` starts without errors, MongoDB connects

---

## AI Provider Abstraction — added between Phase 1 and Phase 2
> Goal: Swap AI providers (Gemini, OpenAI, OpenRouter) via a single env var with no code changes.

- [x] Create `src/types/index.ts` — pulled forward from Phase 2; needed by the AIProvider interface
- [x] Create `src/services/AIProvider.ts` — interface with single `GenerateResponse()` method
- [x] Create `src/services/GeminiProvider.ts` — full Gemini implementation via `@google/generative-ai`
- [x] Create `src/services/OpenAIProvider.ts` — stub; throws "not implemented" with TODO
- [x] Create `src/services/OpenRouterProvider.ts` — full implementation via `openai` SDK pointed at OpenRouter base URL
- [x] Create `src/config/aiProviderFactory.ts` — reads `AI_PROVIDER`, returns correct implementation
- [x] Update `src/config/env.ts` — validates `AI_PROVIDER`; conditionally requires only the active provider's keys
- [x] Update `backend/package.json` — added `@google/generative-ai`
- [x] Update `.env` and `.env.example` — added `AI_PROVIDER`, `GEMINI_*`, `OPENROUTER_*` vars
- [x] Delete `src/config/openai.ts` — singleton absorbed into provider implementations

---

## Phase 2 — Backend Core
> Goal: A working POST /api/chat endpoint that talks to the AI provider and returns a response.

- [x] Create `src/types/index.ts` — define `Message`, `ConversationSession`, `FeedbackVote` (done in abstraction phase)
- [x] Create `src/models/Conversation.ts` — Mongoose schema
- [x] Create `src/models/Feedback.ts` — Mongoose schema
- [x] Create `src/repositories/conversationRepository.ts`
  - [x] `GetSessionHistory(sessionId)` — returns messages array
  - [x] `SaveMessage(sessionId, message)` — appends message to session (upsert)
  - [x] `CreateSession(sessionId)` — creates new empty session
- [x] Create `src/services/chatService.ts`
  - [x] `ProcessUserMessage(sessionId, userMessage)` — full orchestration via `GetAIProvider()`
- [x] Create `src/routes/chatRoutes.ts` — POST `/api/chat`; generates `sessionId` if absent
- [x] Create `src/middleware/errorHandler.ts` — catches all unhandled errors
- [x] Register routes and middleware in `server.ts`
- [x] Verify: POST `/api/chat` returns a reply and conversation history is maintained across messages

---

## Phase 3 — Feedback Endpoint
> Goal: Thumbs up/down votes are saved to MongoDB.

- [x] Create `src/repositories/feedbackRepository.ts`
  - [x] `SaveFeedback(messageId, sessionId, vote)` — saves to `feedbacks` collection
  - [x] `GetNegativeFeedback()` — returns all thumbs-down entries (used in Phase 5)
- [x] Create `src/routes/feedbackRoutes.ts` — POST `/api/feedback`
- [x] Register feedback routes in `server.ts`
- [x] Add `mongo-express` service to `docker-compose.yml` — MongoDB UI at `http://localhost:8081`
- [x] Verify: POST `/api/feedback` saves document in MongoDB

---

## Phase 4 — Frontend
> Goal: A working chat UI in the browser that talks to the backend.

- [x] Create `/frontend` with Vite + React + TypeScript
- [x] Install: `tailwindcss` (v4 via `@tailwindcss/vite` plugin), native `fetch` (no axios)
- [x] Configure Vite proxy to forward `/api` calls to `http://localhost:3000`
- [x] Create `src/services/apiService.ts` — `SendMessage()`, `SubmitFeedback()`
- [x] Create `src/components/MessageBubble.tsx` — shows one message + 👍👎 buttons
- [x] Create `src/components/FeedbackButtons.tsx` — handles vote submission
- [x] Create `src/components/ChatWindow.tsx` — manages session, message list, input box
- [x] Update `App.tsx` to render `ChatWindow`
- [x] Session ID + message history stored in `localStorage` — persists across page refreshes
  - ⚠️ Note: switching browser/device or clearing localStorage shows an empty UI;
    the backend (MongoDB) still has the full history but the browser won't display it
- [ ] Verify: Can send a message in the browser and see the bot reply

---

## Phase 5 — Feedback Loop (The Thesis Feature)
> Goal: Negative feedback influences the bot's future responses.

- [x] In `chatService.ts`, add `BuildSystemPrompt()` function
  - [x] Fetches recent thumbs-down feedback from MongoDB
  - [x] Injects bad examples into the system prompt as negative few-shot examples
- [x] Update `ProcessUserMessage()` to use `BuildSystemPrompt()` on every request
- [ ] Verify: After submitting 👎 on a response, the same question gets a different answer

---

## Phase 6 — Polish & Demo Prep
> Goal: Project looks clean and is ready to show.

- [x] Add loading spinner in the frontend while waiting for bot reply
- [x] Handle errors gracefully in the UI (network error, API error)
- [x] Add a simple session ID stored in `localStorage` so the conversation persists on refresh
- [x] Write a `README.md` with setup instructions and how to run with Docker
- [ ] Clean up any leftover `console.log` debug statements — skipped by design (kept for demo)
- [ ] Final test: fresh `docker-compose up` from scratch, full flow works end to end

---

## Nice to Have (If Time Permits)
> Do NOT start these until Phase 6 is complete.

- [x] Simple admin page that lists all thumbs-down feedback entries
- [x] Ability to manually correct a bad answer from the admin page
- [ ] Typing indicator ("bot is typing...") animation in the chat UI
- [ ] Switch `OPENROUTER_MODEL` to a more capable model for the final demo
