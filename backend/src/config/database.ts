// database.ts
// Manages the MongoDB connection via Mongoose.
// Call ConnectToDatabase() once at application startup.

import mongoose from "mongoose";
import { env } from "./env";

/**
 * Opens a connection to MongoDB using the URI from environment config.
 *
 * @returns A promise that resolves when the connection is established.
 * @throws Error if the connection attempt fails.
 */
export async function ConnectToDatabase(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI);
  console.log("Connected to MongoDB at", env.MONGODB_URI);
}
