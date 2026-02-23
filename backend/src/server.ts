// server.ts
// Entry point for the Express application.
// Initialises middleware, connects to the database, and starts the HTTP server.

import express from "express";
import cors from "cors";
import { env } from "./config/env";
import { ConnectToDatabase } from "./config/database";
import { chatRouter } from "./routes/chatRoutes";
import { feedbackRouter } from "./routes/feedbackRoutes";
import { adminRouter } from "./routes/adminRoutes";
import { errorHandler } from "./middleware/errorHandler";

const app = express();

// --- Middleware ---
app.use(cors());
app.use(express.json());

// --- Health check ---
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// --- Routes ---
app.use("/api/chat", chatRouter);

app.use("/api/feedback", feedbackRouter);

app.use("/api/admin", adminRouter);

// --- Error handler — must be last ---
app.use(errorHandler);

// --- Start ---
async function StartServer(): Promise<void> {
  await ConnectToDatabase();
  app.listen(env.PORT, () => {
    console.log(`Server running on port ${env.PORT} [${env.NODE_ENV}]`);
  });
}

StartServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
