import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import "dotenv/config";

const app = express();
app.use(express.json());

// Enable CORS for API routes
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS, PUT, PATCH, DELETE",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-Requested-With,content-type",
  );
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

const port = 3001;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// HTTP routes
// status route
app.get("/api/status", (req, res) => {
  res.json({ status: "ok" });
});

// create interview session
app.post("/api/interviews", async (req, res) => {
  try {
    // Find or create a default test user
    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: "test@example.com",
          name: "Test Candidate",
        },
      });
    }

    const interview = await prisma.interview.create({
      data: {
        userId: user.id,
        status: "IN_PROGRESS",
        systemPrompt: "Elena Rostova - CS Interviewer",
      },
    });

    res.status(201).json({
      interviewId: interview.id,
      status: interview.status,
    });
  } catch (error) {
    console.error("Error creating interview:", error);
    res.status(500).json({ error: "Failed to start interview" });
  }
});

// fetch logs for an interview
app.get("/api/interviews/:id/logs", async (req, res) => {
  const { id } = req.params;
  try {
    const logs = await prisma.interviewLog.findMany({
      where: { interviewId: id },
      orderBy: { createdAt: "asc" },
    });
    res.json({ logs });
  } catch (error) {
    console.error("Error fetching logs:", error);
    res.status(500).json({ error: "Failed to fetch logs" });
  }
});

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });

// WebSocket connection handling
wss.on(
  "connection",
  async (ws: WebSocket, request?: any, interviewId?: string) => {
    const reqUrl = new URL(request.url || "", "http://localhost");
    const personaId = reqUrl.searchParams.get("persona") || "elena";

    console.log(
      `[Server] WebSocket connection opened for interview ${interviewId} (Persona: ${personaId})`,
    );

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error("[Server] GEMINI_API_KEY is not defined in env");
      ws.send(
        JSON.stringify({
          type: "error",
          message: "GEMINI_API_KEY is not set on backend",
        }),
      );
      ws.close();
      return;
    }

    // Connect to Gemini Live API WebSocket (BidiGenerateContent)
    const geminiUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${apiKey}`;
    const geminiWs = new WebSocket(geminiUrl);

    let currentUtteranceUser = "";
    let currentUtteranceAssistant = "";

    const systemPrompts: Record<string, string> = {
      elena:
        "You are Elena Rostova, a Principal System Design Expert conducting a technical mock interview for a Computer Science student. " +
        "Start immediately by introducing yourself briefly, say 'Welcome to your mock interview. Tell me about yourself.', and wait for their response. " +
        "After they introduce themselves, ask them deep, relevant computer science and system design questions. Ask one question at a time and follow up naturally based on their responses. " +
        "Keep responses professional, concise, and focused on system architecture. Respond using your voice output.",
      marcus:
        "You are Marcus Vance, an HR Behavioral Lead conducting a mock behavioral interview for a software engineering position. " +
        "Start immediately by introducing yourself, say 'Welcome to your mock interview. Let's start by telling me about yourself.', and wait for their response. " +
        "After that, walk through STAR framework questions, focus on conflict resolution, alignment, and leadership. Ask one question at a time. Respond using your voice output.",
      sarah:
        "You are Sarah Chen, a Frontend Tech Lead conducting a mock frontend architecture interview. " +
        "Start immediately by introducing yourself, say 'Welcome to your mock interview. Let's start, tell me about yourself.', and wait for their response. " +
        "Afterwards, ask about browser rendering lifecycles, performance optimizations, state management, and modern framework patterns. Ask one question at a time. Respond using your voice output.",
    };

    const systemInstruction = systemPrompts[personaId] || systemPrompts.elena;

    geminiWs.on("open", () => {
      console.log(`[Server] Connected to Gemini Multimodal Live API`);

      // Send session configuration
      const setupMessage = {
        setup: {
          model: "models/gemini-3.1-flash-live",
          generationConfig: {
            responseModalities: ["AUDIO", "TEXT"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: {
                  voiceName: "Aoede",
                },
              },
            },
          },
          systemInstruction: {
            parts: [
              {
                text: systemInstruction,
              },
            ],
          },
        },
      };

      geminiWs.send(JSON.stringify(setupMessage));
      ws.send(JSON.stringify({ type: "status", status: "listening" }));
    });

    geminiWs.on("message", async (data) => {
      try {
        const response = JSON.parse(data.toString());

        // Handle user transcription (STT) from Gemini Live
        if (response.inputTranscription) {
          const text = response.inputTranscription.text;
          if (text) {
            currentUtteranceUser += text + " ";
          }
          if (response.inputTranscription.turnComplete) {
            const finalizedText = currentUtteranceUser.trim();
            if (finalizedText) {
              console.log(`[STT User]: ${finalizedText}`);
              ws.send(
                JSON.stringify({
                  type: "user_transcript",
                  text: finalizedText,
                }),
              );

              // Save user transcription to Database
              try {
                await prisma.interviewLog.create({
                  data: {
                    interviewId: interviewId!,
                    sender: "user",
                    text: finalizedText,
                  },
                });
              } catch (dbErr) {
                console.error("Failed to log user STT to DB:", dbErr);
              }
            }
            currentUtteranceUser = ""; // reset for next turn
          }
        }

        // Handle assistant response content (TTS and Text transcript)
        if (response.serverContent) {
          ws.send(JSON.stringify({ type: "status", status: "speaking" }));

          const modelTurn = response.serverContent.modelTurn;
          if (modelTurn && modelTurn.parts) {
            for (const part of modelTurn.parts) {
              // Forward Audio Chunk to client
              if (part.mimeType && part.mimeType.startsWith("audio/pcm")) {
                ws.send(
                  JSON.stringify({
                    type: "audio",
                    data: part.data, // Base64 encoded audio
                  }),
                );
              }

              // Capture text output
              if (part.text) {
                currentUtteranceAssistant += part.text;
                ws.send(
                  JSON.stringify({
                    type: "text",
                    text: part.text,
                  }),
                );
              }
            }
          }

          // If user starts talking while assistant is speaking, handle interruption
          if (response.serverContent.interrupted) {
            console.log(`[Server] Assistant interrupted by user`);
            ws.send(JSON.stringify({ type: "interrupted" }));
            currentUtteranceAssistant = ""; // reset
          }

          // Turn completed
          if (response.serverContent.turnComplete) {
            const finalizedAssistantText = currentUtteranceAssistant.trim();
            if (finalizedAssistantText) {
              console.log(`[TTS Assistant]: ${finalizedAssistantText}`);

              // Save assistant response to Database
              try {
                await prisma.interviewLog.create({
                  data: {
                    interviewId: interviewId!,
                    sender: "assistant",
                    text: finalizedAssistantText,
                  },
                });
              } catch (dbErr) {
                console.error("Failed to log assistant response to DB:", dbErr);
              }
            }
            currentUtteranceAssistant = ""; // reset for next turn
            ws.send(JSON.stringify({ type: "status", status: "listening" }));
          }
        }
      } catch (err) {
        console.error("Error processing message from Gemini:", err);
      }
    });

    geminiWs.on("error", (err) => {
      console.error("Gemini WebSocket error:", err);
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Gemini session error occurred",
        }),
      );
    });

    geminiWs.on("close", (code, reason) => {
      console.log(
        `[Server] Gemini connection closed: ${code} - ${reason.toString()}`,
      );
      ws.send(JSON.stringify({ type: "status", status: "idle" }));
    });

    // Handle messages from client
    ws.on("message", (message, isBinary) => {
      if (isBinary) {
        // Forward raw PCM audio data from client to Gemini.
        // Client sends raw mono 16kHz PCM audio bytes.
        const base64Audio = Buffer.from(message as Buffer).toString("base64");
        const mediaChunk = {
          realtimeInput: {
            mediaChunks: [
              {
                mimeType: "audio/pcm",
                data: base64Audio,
              },
            ],
          },
        };
        if (geminiWs.readyState === WebSocket.OPEN) {
          geminiWs.send(JSON.stringify(mediaChunk));
        }
      } else {
        // Handle JSON commands from client
        try {
          const payload = JSON.parse(message.toString());

          if (payload.type === "text" && payload.text) {
            // Send typed text to Gemini
            const textTurn = {
              clientContent: {
                turns: [
                  {
                    role: "user",
                    parts: [{ text: payload.text }],
                  },
                ],
                turnComplete: true,
              },
            };
            if (geminiWs.readyState === WebSocket.OPEN) {
              geminiWs.send(JSON.stringify(textTurn));
            }
          } else if (payload.type === "end") {
            console.log(`[Server] Client ended interview ${interviewId}`);
            prisma.interview
              .update({
                where: { id: interviewId },
                data: { status: "COMPLETED" },
              })
              .catch((err) =>
                console.error("Failed to update interview status:", err),
              );

            ws.close();
          }
        } catch (err) {
          console.error("Error parsing text message from client:", err);
        }
      }
    });

    ws.on("close", () => {
      console.log(
        `[Server] Client WebSocket closed for interview ${interviewId}`,
      );
      if (
        geminiWs.readyState === WebSocket.OPEN ||
        geminiWs.readyState === WebSocket.CONNECTING
      ) {
        geminiWs.close();
      }
    });
  },
);

// Upgrade HTTP request to WebSocket connection if URL matches
server.on("upgrade", (request, socket, head) => {
  const url = new URL(request.url || "", `http://${request.headers.host}`);
  const pathname = url.pathname;

  // Pattern: /api/interviews/:interviewId
  const match = pathname.match(/^\/api\/interviews\/([a-zA-Z0-9-]+)$/);
  if (match && match[1]) {
    const interviewId = match[1];
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request, interviewId);
    });
  } else {
    socket.destroy();
  }
});

server.listen(port, () => {
  console.log(`Backend server listening on http://localhost:${port}`);
});

