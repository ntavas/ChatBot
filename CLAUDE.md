# CLAUDE.md — Project Instructions for AI Customer Support Chatbot
See @docs/architecture.md for full project structure and data flow.
See @docs/plan.md for the current implementation checklist.


This file defines the coding standards, architecture guidelines, and conventions
for this project. Follow these rules consistently across all files.

---

## Project Overview

An AI-powered customer support chatbot built with:
- **Backend:** Node.js + TypeScript + Express
- **AI:** OpenAI API (GPT-4)
- **Database:** MongoDB (via Mongoose)
- **Infrastructure:** Docker + docker-compose
- **Frontend:** React + TypeScript

---

## Code Style & Naming Conventions

### General Rules
- Write code as if the next person reading it has never seen this project before.
- Prefer clarity over cleverness. A slightly longer but readable solution beats a smart one-liner.
- Every file should have a single, clear responsibility.

### Naming
- **Methods and functions:** `PascalCase`, and always descriptive.
  - ✅ `GetUserConversationHistory`, `SaveFeedback`, `BuildSystemPrompt`
  - ❌ `getData`, `doStuff`, `handleIt`, `x`, `temp`
- **Variables:** `camelCase`, and always descriptive.
  - ✅ `conversationHistory`, `userMessage`, `feedbackScore`
  - ❌ `data`, `res2`, `temp`, `x`
- **Classes and interfaces:** `PascalCase`
  - ✅ `ConversationService`, `FeedbackRepository`
- **Constants:** `UPPER_SNAKE_CASE`
  - ✅ `MAX_CONVERSATION_HISTORY_LENGTH`, `DEFAULT_SYSTEM_PROMPT`
- **Files:** `camelCase` for services/utils, `PascalCase` for classes/components
  - ✅ `conversationService.ts`, `ChatWindow.tsx`
- **Boolean variables:** should read like a question
  - ✅ `isLoading`, `hasError`, `isResolved`

---

## Documentation & Comments

### Functions and Methods
Every function must have a JSDoc comment that explains:
1. What it does (one sentence)
2. What each parameter is
3. What it returns
4. Any important side effects or errors it can throw

```typescript
/**
 * Retrieves the full conversation history for a given session from the database.
 *
 * @param sessionId - The unique identifier of the chat session.
 * @returns An array of messages ordered from oldest to newest.
 * @throws DatabaseError if the connection to MongoDB fails.
 */
async function GetConversationBySessionId(sessionId: string): Promise<Message[]> {
  // ...
}
```

### Inline Comments
- Use inline comments to explain the **why**, not the **what**.
  - ✅ `// OpenAI requires the full history on every request — it has no memory of its own`
  - ❌ `// loop through messages` (the code already says that)
- Comment any non-obvious business logic, magic numbers, or workarounds.

### File Headers
Every file should start with a short comment explaining its purpose:
```typescript
// conversationService.ts
// Handles all business logic related to chat sessions:
// creating new sessions, appending messages, and retrieving history.
```

---

## Architecture

The project follows a simple **3-layer architecture** appropriate for this scale:

```
src/
├── routes/          # HTTP layer — defines endpoints, validates input
├── services/        # Business logic — talks to OpenAI, applies rules
├── repositories/    # Database layer — all MongoDB queries live here
├── models/          # Mongoose schemas and TypeScript interfaces
├── middleware/       # Express middleware (error handling, auth, logging)
├── config/          # Environment variables and app configuration
└── types/           # Shared TypeScript types and interfaces
```

### Rules
- **Routes** should not contain business logic. They receive a request, call a service, return a response.
- **Services** should not contain raw database queries. They call repositories.
- **Repositories** should not contain business logic. They only query the database.
- If you are unsure where something belongs, ask: *"Would this change if I switched from MongoDB to PostgreSQL?"* If yes → repository. *"Would this change if I switched from Express to a CLI?"* If yes → route.

### Example Flow
```
POST /api/chat
  → chatRouter
    → chatService.ProcessUserMessage()
      → conversationRepository.GetSessionHistory()
      → openAIService.GenerateResponse()
      → conversationRepository.SaveMessage()
    → return response
```

---

## Error Handling

- Never let errors fail silently. Always catch and either handle or rethrow with context.
- Use a centralized error handling middleware in Express — do not write `res.status(500)` in every route.
- Log errors with enough context to debug them later (session ID, user action, timestamp).

```typescript
// ✅ Good — adds context before rethrowing
try {
  await openAIService.GenerateResponse(messages);
} catch (error) {
  throw new Error(`Failed to generate AI response for session ${sessionId}: ${error.message}`);
}

// ❌ Bad — swallows the error silently
try {
  await openAIService.GenerateResponse(messages);
} catch (error) {
  console.log("oops");
}
```

---

## Environment Variables

- Never hardcode secrets, API keys, or environment-specific values.
- All config values go in `.env` (not committed) and are documented in `.env.example` (committed).
- Access them only through the `config/` module, never directly via `process.env` scattered across files.

```
# .env.example
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4o-mini
MONGODB_URI=mongodb://localhost:27017/chatbot
PORT=3000
NODE_ENV=development
```

---

## OpenAI Model Selection & Cost Awareness

The model is configured via the `OPENAI_MODEL` environment variable — never hardcoded.
This allows switching models without touching the codebase.

| Model | Input /1M tokens | Output /1M tokens | When to use |
|---|---|---|---|
| `gpt-4o-mini` | $0.15 | $0.60 | Development, testing, daily use |
| `gpt-4o` | $2.50 | $10.00 | Demo day only, if needed |

**Default is `gpt-4o-mini`.** It is more than capable for a customer support chatbot
and costs roughly $0.0003 per message — meaning $5 covers over 10,000 messages.

> ⚠️ Never commit your `OPENAI_API_KEY` to git. Add `.env` to `.gitignore` immediately.

---

## TypeScript

- Always define types/interfaces for function parameters and return values.
- Avoid `any`. If you genuinely don't know the type yet, use `unknown` and add a TODO comment.
- Define shared types in `src/types/` so they can be reused across layers.

```typescript
// src/types/conversation.ts

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
}

export interface ConversationSession {
  sessionId: string;
  messages: Message[];
  createdAt: Date;
  updatedAt: Date;
}
```

---

## Git Conventions

### Commit Messages
Use the format: `type: short description`

| Type | When to use |
|------|-------------|
| `feat` | Adding a new feature |
| `fix` | Fixing a bug |
| `docs` | Documentation only |
| `refactor` | Code change that is not a feature or fix |
| `chore` | Setup, config, dependencies |

Examples:
- `feat: add feedback endpoint to save thumbs up/down per message`
- `fix: prevent duplicate messages when user submits form twice`
- `docs: add JSDoc to conversationService methods`

---

## What to Avoid

- No `console.log` left in production code for debugging. Use a proper logger or remove them.
- No commented-out blocks of old code left in files. That is what git history is for.
- No functions longer than ~40 lines. If it is getting long, it is probably doing too many things.
- No single file doing everything. A 500-line `server.ts` that handles routes, DB, and AI is a red flag.
