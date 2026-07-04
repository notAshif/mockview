import * as repo from "../repositories/interviewRepository.js";
import { mintEphemeralToken } from "../gemini/tokenService.js";
import { getPersona, isValidPersonaId } from "../gemini/personas.js";
import { logger } from "../utils/logger.js";
import type { Interview, InterviewLog } from "@prisma/client";

export interface CreateInterviewResult {
  interviewId: string;
  persona: string;
  personaName: string;
  ephemeralToken: string;
  geminiModel: string;
  expiresAt: string;
}

export interface InterviewDetails {
  interview: Interview;
  logs: InterviewLog[];
  duration: number | null;
  score: number | null;
  feedback: string | null;
}

export interface EndInterviewResult {
  interviewId: string;
  status: string;
  duration: number;
  score: number;
  feedback: string;
}

/**
 * Creates a new interview session: persists to DB + mints Gemini ephemeral token.
 */
export async function createInterview(
  personaId: string,
): Promise<CreateInterviewResult> {
  const resolvedPersonaId = isValidPersonaId(personaId) ? personaId : "elena";
  const persona = getPersona(resolvedPersonaId);

  logger.info("Creating interview", { personaId: resolvedPersonaId });

  const user = await repo.findOrCreateDefaultUser();

  const interview = await repo.createInterview({
    userId: user.id,
    personaId: resolvedPersonaId,
    systemPrompt: persona.systemPrompt,
  });

  // Mint token after DB record is created — we pass interviewId for audit logging
  const tokenResult = await mintEphemeralToken(resolvedPersonaId, interview.id);

  logger.info("Interview created", {
    interviewId: interview.id,
    personaId: resolvedPersonaId,
  });

  return {
    interviewId: interview.id,
    persona: resolvedPersonaId,
    personaName: persona.name,
    ephemeralToken: tokenResult.token,
    geminiModel: tokenResult.model,
    expiresAt: tokenResult.expiresAt,
  };
}

/**
 * Stores a single transcript event (user or assistant utterance).
 */
export async function logTranscript(
  interviewId: string,
  sender: string,
  text: string,
): Promise<void> {
  if (!text.trim()) return;

  await repo.createInterviewLog({ interviewId, sender, text });

  logger.info("Transcript logged", { interviewId, sender, length: text.length });
}

/**
 * Marks interview as completed, computes duration + score heuristics.
 */
export async function endInterview(
  interviewId: string,
  startedAt?: string,
): Promise<EndInterviewResult> {
  const existing = await repo.findInterviewById(interviewId);
  if (!existing) {
    const err = new Error("Interview not found") as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  // Compute duration (seconds) from createdAt to now
  const createdAt = existing.createdAt;
  const now = new Date();
  const duration = Math.floor((now.getTime() - createdAt.getTime()) / 1000);

  // Score heuristic based on transcript length and word variety
  const { score, feedback } = computeScore(existing.logs);

  const updated = await repo.completeInterview({
    id: interviewId,
    duration,
    score,
    feedback,
  });

  logger.info("Interview completed", { interviewId, duration, score });

  return {
    interviewId: updated.id,
    status: updated.status,
    duration,
    score,
    feedback,
  };
}

/**
 * Fetches full interview details including all transcript logs.
 */
export async function getInterview(
  interviewId: string,
): Promise<InterviewDetails> {
  const interview = await repo.findInterviewById(interviewId);
  if (!interview) {
    const err = new Error("Interview not found") as Error & { statusCode: number };
    err.statusCode = 404;
    throw err;
  }

  return {
    interview,
    logs: interview.logs,
    duration: interview.duration,
    score: interview.score,
    feedback: interview.feedback,
  };
}

/**
 * Fetches all transcript logs for an interview.
 */
export async function getInterviewLogs(interviewId: string): Promise<InterviewLog[]> {
  return repo.findLogsByInterviewId(interviewId);
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function computeScore(logs: InterviewLog[]): { score: number; feedback: string } {
  const userLogs = logs.filter((l) => l.sender === "user");
  const totalWords = userLogs.reduce(
    (acc, l) => acc + l.text.split(/\s+/).length,
    0,
  );
  const averageWords = userLogs.length > 0 ? totalWords / userLogs.length : 0;

  // Filler word penalty
  const allUserText = userLogs.map((l) => l.text).join(" ").toLowerCase();
  const fillerMatches = allUserText.match(/\b(um|uh|like|basically|so|you know)\b/g);
  const fillerCount = fillerMatches?.length ?? 0;

  // Base score from response depth, penalize fillers
  let score = 60;
  if (averageWords > 80) score += 20;
  else if (averageWords > 40) score += 10;
  if (userLogs.length >= 4) score += 10;
  score = Math.max(0, Math.min(100, score - fillerCount * 2));

  const feedback =
    score >= 85
      ? "Excellent depth and clarity in responses. Strong candidate."
      : score >= 70
        ? "Good responses overall. Consider expanding on technical details."
        : score >= 55
          ? "Adequate responses. Work on structure and minimizing filler words."
          : "Responses were brief. Practice elaborating with the STAR framework.";

  return { score, feedback };
}
