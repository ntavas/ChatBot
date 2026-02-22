# Architecture Overview

## Project Description
An AI-powered customer support chatbot that uses GPT-4o-mini to answer user questions,
stores conversation history in MongoDB, and allows administrators to submit feedback
on bot responses to continuously improve the system over time.

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React + TypeScript + Tailwind CSS | Fast to build, easy to explain |
| Backend | Node.js + TypeScript + Express | Lightweight, simple routing |
| AI | OpenAI API (gpt-4o-mini) | Cost-effective, capable enough |
| Database | MongoDB + Mongoose | Flexible schema, easy to set up |
| Infrastructure | Docker + docker-compose | Consistent environment across machines |

---

## Folder Structure

```
/
├── CLAUDE.md
├── docker-compose.yml
├── .env.example
├── .gitignore
│
├── /docs
│   ├── architecture.md       ← this file
│   └── plan.md               ← implementation checklist
│
├── /backend
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   └── /src
│       ├── server.ts             ← entry point, starts Express
│       ├── /config
│       │   └── database.ts       ← MongoDB connection
│       │   └── openai.ts         ← OpenAI client setup
│       │   └── env.ts            ← reads and validates .env variables
│       ├── /routes
│       │   ├── chatRoutes.ts     ← POST /api/chat
│       │   └── feedbackRoutes.ts ← POST /api/feedback
│       ├── /services
│       │   ├── chatService.ts    ← orchestrates the chat flow
│       │   └── openAIService.ts  ← talks to the OpenAI API
│       ├── /repositories
│       │   ├── conversationRepository.ts  ← DB queries for conversations
│       │   └── feedbackRepository.ts      ← DB queries for feedback
│       ├── /models
│       │   ├── Conversation.ts   ← Mongoose schema for chat sessions
│       │   └── Feedback.ts       ← Mongoose schema for feedback entries
│       ├── /middleware
│       │   └── errorHandler.ts   ← centralized Express error handling
│       └── /types
│           └── index.ts          ← shared TypeScript interfaces
│
└── /frontend
    ├── package.json
    └── /src
        ├── App.tsx
        ├── /components
        │   ├── ChatWindow.tsx     ← main chat UI
        │   ├── MessageBubble.tsx  ← single message with thumbs up/down
        │   └── FeedbackButtons.tsx
        └── /services
            └── apiService.ts     ← all fetch calls to the backend
```

---

## Data Flow

### Sending a message
```
User types message
  → ChatWindow.tsx
    → POST /api/chat  { sessionId, message }
      → chatRoutes.ts
        → chatService.ProcessUserMessage()
          → conversationRepository.GetSessionHistory()   ← load history from MongoDB
          → openAIService.GenerateResponse()             ← call OpenAI with full history
          → conversationRepository.SaveMessage()         ← save user + assistant messages
        → return { sessionId, reply }
  → MessageBubble renders the reply
```

### Submitting feedback
```
User clicks 👍 or 👎 on a message
  → FeedbackButtons.tsx
    → POST /api/feedback  { messageId, sessionId, vote: "up" | "down" }
      → feedbackRoutes.ts
        → feedbackRepository.SaveFeedback()    ← save to MongoDB
      → return { success: true }
```

---

## MongoDB Collections

### `conversations`
```json
{
  "_id": "ObjectId",
  "sessionId": "uuid-string",
  "messages": [
    {
      "role": "user | assistant | system",
      "content": "string",
      "timestamp": "Date",
      "messageId": "uuid-string"
    }
  ],
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

### `feedbacks`
```json
{
  "_id": "ObjectId",
  "messageId": "uuid-string",
  "sessionId": "uuid-string",
  "vote": "up | down",
  "createdAt": "Date"
}
```

---

## How the Feedback Loop Works

1. User submits 👎 on a bot response → saved in `feedbacks` collection
2. Admin panel (future) can review all negative feedback
3. Negative examples are injected into the system prompt as few-shot examples:
   > "When asked X, do NOT answer like this: [bad answer]. Instead say: [corrected answer]"
4. This improves responses without re-training the model (prompt engineering approach)
5. Long-term: collected pairs can be used for OpenAI fine-tuning

---

## Environment Variables

```
OPENAI_API_KEY=        ← from platform.openai.com
OPENAI_MODEL=gpt-4o-mini
MONGODB_URI=mongodb://mongo:27017/chatbot
PORT=3000
NODE_ENV=development
```

---

## Docker Setup

Two services in docker-compose:
- `backend` — Node.js app on port 3000
- `mongo` — MongoDB on port 27017

Frontend runs locally with `npm run dev` (Vite) during development,
proxying API calls to the backend container.
