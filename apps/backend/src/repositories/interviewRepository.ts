import prisma from "../prisma/client.js";
import type { Interview, InterviewLog } from "@prisma/client";

export type { Interview, InterviewLog };

export async function findOrCreateDefaultUser(): Promise<{ id: string }> {
  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: "candidate@mockview.app",
        name: "Interview Candidate",
      },
    });
  }
  return user;
}

export async function createInterview(params: {
  userId: string;
  personaId: string;
  systemPrompt: string;
}): Promise<Interview> {
  return prisma.interview.create({
    data: {
      user: { connect: { id: params.userId } },
      persona: params.personaId,
      systemPrompt: params.systemPrompt,
      status: "IN_PROGRESS",
    },
  });
}

export async function findInterviewById(
  id: string,
): Promise<(Interview & { logs: InterviewLog[] }) | null> {
  return prisma.interview.findUnique({
    where: { id },
    include: { logs: { orderBy: { createdAt: "asc" } } },
  });
}

export async function createInterviewLog(params: {
  interviewId: string;
  sender: string;
  text: string;
}): Promise<InterviewLog> {
  return prisma.interviewLog.create({
    data: {
      interviewId: params.interviewId,
      sender: params.sender,
      text: params.text,
    },
  });
}

export async function findLogsByInterviewId(
  interviewId: string,
): Promise<InterviewLog[]> {
  return prisma.interviewLog.findMany({
    where: { interviewId },
    orderBy: { createdAt: "asc" },
  });
}

export async function completeInterview(params: {
  id: string;
  duration: number;
  score: number;
  feedback: string;
}): Promise<Interview> {
  return prisma.interview.update({
    where: { id: params.id },
    data: {
      status: "COMPLETED",
      duration: params.duration,
      score: params.score,
      feedback: params.feedback,
    },
  });
}
