import { Router } from "express";
import { generateWatchlistSuggestions } from "../services/suggestions.js";

export const suggestionsRouter = Router();

suggestionsRouter.get("/", async (_req, res) => {
  try {
    const suggestions = await generateWatchlistSuggestions();
    res.json({ suggestions, count: suggestions.length, timestamp: Date.now() });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "suggestions failed" });
  }
});
