import express from "express";
import "dotenv/config";
import { corsMiddleware } from "./middleware/cors.js";
import { errorHandler } from "./middleware/errorHandler.js";
import interviewRoutes from "./routes/interviewRoutes.js";
import { logger } from "./utils/logger.js";

export function createApp() {
  const app = express();

  // ── Middleware ──────────────────────────────────────────────────────────────
  app.use(corsMiddleware);
  app.use(express.json());

  // ── Routes ──────────────────────────────────────────────────────────────────
  app.use("/api", interviewRoutes);

  // ── Global error handler (must be last) ─────────────────────────────────────
  app.use(errorHandler);

  return app;
}

export function startServer(port: number) {
  const app = createApp();
  const server = app.listen(port, () => {
    logger.info("Backend server started", { port, url: `http://localhost:${port}` });
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    server.close(() => {
      logger.info("Server closed");
      process.exit(0);
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  return server;
}
