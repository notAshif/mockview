import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import {
  createInterview,
  logTranscript,
  endInterview,
  getInterview,
  getInterviewLogs,
} from "../interview/interviewService.js";
import { logger } from "../utils/logger.js";

const router = Router();

// ─── GET /api/status ────────────────────────────────────────────────────────
router.get("/status", (_req: Request, res: Response) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── POST /api/interviews ────────────────────────────────────────────────────
// Creates interview session and mints a Gemini ephemeral token.
router.post(
  "/interviews",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { persona = "elena" } = req.body as { persona?: string };
      const result = await createInterview(persona);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/interviews/:id/log ────────────────────────────────────────────
// Store a transcript event (sender: "user" | "assistant", text: string)
router.post(
  "/interviews/:id/log",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { sender, text } = req.body as { sender?: string; text?: string };

      if (!sender || !text) {
        res.status(400).json({ error: "sender and text are required" });
        return;
      }

      if (sender !== "user" && sender !== "assistant") {
        res.status(400).json({ error: "sender must be 'user' or 'assistant'" });
        return;
      }

      await logTranscript(id!, sender, text);
      res.status(201).json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// ─── POST /api/interviews/:id/end ────────────────────────────────────────────
// Mark interview completed, compute score.
router.post(
  "/interviews/:id/end",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await endInterview(id!);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/interviews/:id ─────────────────────────────────────────────────
// Returns transcript, metadata, score, duration.
router.get(
  "/interviews/:id",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const result = await getInterview(id!);
      res.json(result);
    } catch (err) {
      next(err);
    }
  },
);

// ─── GET /api/interviews/:id/logs ────────────────────────────────────────────
// Returns all transcript logs for the interview.
router.get(
  "/interviews/:id/logs",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const logs = await getInterviewLogs(id!);
      res.json({ logs });
    } catch (err) {
      next(err);
    }
  },
);

export default router;
