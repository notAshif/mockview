import { GoogleGenAI } from "@google/genai";
import { getPersona } from "./personas.js";
import { logger } from "../utils/logger.js";

const GEMINI_MODEL = "models/gemini-2.5-flash-native-audio-preview-12-2025";

// Token lifetime: 10 minutes to use, then session lasts up to 30 minutes
const TOKEN_TTL_MINUTES = 10;

export interface EphemeralTokenResult {
  token: string;
  model: string;
  expiresAt: string;
}

let genaiClient: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!genaiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY environment variable is not set");
    }
    genaiClient = new GoogleGenAI({
      apiKey,
      httpOptions: { apiVersion: "v1alpha" },
    });
  }
  return genaiClient;
}

export async function mintEphemeralToken(
  personaId: string,
  interviewId: string,
): Promise<EphemeralTokenResult> {
  const client = getClient();
  const persona = getPersona(personaId);

  const expireTime = new Date(
    Date.now() + TOKEN_TTL_MINUTES * 60 * 1000,
  ).toISOString();

  logger.info("Minting ephemeral token", {
    personaId,
    interviewId,
    model: GEMINI_MODEL,
    expireTime,
  });

  try {
    const token = await (client as any).authTokens.create({
      config: {
        expire_time: expireTime,
        live_connect_constraints: {
          model: GEMINI_MODEL,
          config: {
            system_instruction: {
              parts: [{ text: persona.systemPrompt }],
            },
            response_modalities: ["AUDIO"],
            speech_config: {
              voice_config: {
                prebuilt_voice_config: {
                  voice_name: "Aoede",
                },
              },
            },
            input_audio_transcription: {},
            output_audio_transcription: {},
          },
        },
      },
    });

    logger.info("Ephemeral token minted", { interviewId, tokenName: token.name });

    return {
      token: token.name as string,
      model: GEMINI_MODEL,
      expiresAt: expireTime,
    };
  } catch (err: unknown) {
    logger.error("Failed to mint ephemeral token", {
      interviewId,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
