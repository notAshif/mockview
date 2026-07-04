import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Mic,
  MicOff,
  Clock,
  ArrowLeft,
  Wifi,
  Send,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import bgHero from  "./assets/bg_hero.jpg";
import { playAestheticClick } from "./lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const BACKEND_URL = "http://localhost:3002";

// Constrained endpoint — required when using ephemeral tokens
const GEMINI_WS_BASE =
  "wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained";

async function parseGeminiWsMessage(data: string | Blob | ArrayBuffer): Promise<unknown> {
  let text: string;
  if (typeof data === "string") {
    text = data;
  } else if (data instanceof Blob) {
    text = await data.text();
  } else {
    text = new TextDecoder().decode(data);
  }
  return JSON.parse(text);
}

// CSS Animations
const customStyles = `
@keyframes morph-orb {
  0% { border-radius: 40% 60% 70% 30% / 40% 50% 60% 50%; }
  34% { border-radius: 70% 30% 50% 50% / 30% 60% 40% 70%; }
  67% { border-radius: 50% 60% 30% 70% / 60% 40% 70% 30%; }
  100% { border-radius: 40% 60% 70% 30% / 40% 50% 60% 50%; }
}
@keyframes ripple-ring {
  0% { transform: scale(0.9); opacity: 0.8; }
  100% { transform: scale(1.6); opacity: 0; }
}
@keyframes pulse-soft {
  0%, 100% { transform: scale(1); opacity: 0.8; }
  50% { transform: scale(1.05); opacity: 1; }
}
.morphing-orb {
  animation: morph-orb 8s ease-in-out infinite alternate, spin 20s linear infinite;
}
.ripple-effect {
  animation: ripple-ring 2.5s cubic-bezier(0.1, 0.8, 0.3, 1) infinite;
}
.pulse-glow {
  animation: pulse-soft 3s ease-in-out infinite;
}
.no-scrollbar::-webkit-scrollbar { display: none; }
.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
`;

// ─── Types ────────────────────────────────────────────────────────────────────

type AssistantState = "idle" | "listening" | "thinking" | "speaking";

interface Message {
  sender: "assistant" | "user";
  text: string;
  timestamp: string;
}

interface SessionInfo {
  interviewId: string;
  persona: string;
  ephemeralToken: string;
  geminiModel: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function InterviewPage({ onExit }: { onExit: () => void }) {
  // ── Session info (loaded from URL params on mount) ──────────────────────────
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [assistantState, setAssistantState] = useState<AssistantState>("idle");
  const [timer, setTimer] = useState(0);
  const [micOn, setMicOn] = useState(true);
  const [cameraPermission, setCameraPermission] = useState<"pending" | "granted" | "denied">("pending");
  const [audioLevel, setAudioLevel] = useState(0);
  const [textInput, setTextInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "error">("connecting");
  const [resetCounter, setResetCounter] = useState(0);

  // ── Feedback metrics ────────────────────────────────────────────────────────
  const [metrics, setMetrics] = useState({
    pacing: 0,
    fillers: 0,
    clarity: 98,
    structure: "Not Started",
  });

  // ── Refs ────────────────────────────────────────────────────────────────────
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Gemini direct WebSocket ref (replaces backend WS proxy)
  const geminiWsRef = useRef<WebSocket | null>(null);

  // Audio recording (capture and stream to Gemini directly)
  const recorderContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  // Audio playback (decode 24kHz PCM from Gemini)
  const playbackContextRef = useRef<AudioContext | null>(null);
  const nextPlaybackTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  // Transcript accumulation buffers
  const currentUserUtteranceRef = useRef<string>("");
  const currentAssistantUtteranceRef = useRef<string>("");

  // ── Read session info from URL on mount ─────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    const persona = params.get("persona") || "elena";

    if (!id) {
      alert("No Interview Session ID found. Returning to welcome page.");
      onExit();
      return;
    }

    // Try to read session data stored by Welcome.tsx after POST /api/interviews
    const stored = sessionStorage.getItem(`mockview_session_${id}`);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as {
          ephemeralToken: string;
          geminiModel: string;
          persona: string;
        };
        setSessionInfo({
          interviewId: id,
          persona: parsed.persona || persona,
          ephemeralToken: parsed.ephemeralToken,
          geminiModel: parsed.geminiModel,
        });
        // Clean up sessionStorage after reading
        sessionStorage.removeItem(`mockview_session_${id}`);
        return;
      } catch {
        // Fall through to re-create
      }
    }

    // Fallback: create a new interview session (e.g., page refresh)
    async function initSession() {
      try {
        const res = await fetch(`${BACKEND_URL}/api/interviews`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ persona }),
        });

        if (!res.ok) throw new Error("Failed to init interview session");
        const data = await res.json();

        setSessionInfo({
          interviewId: data.interviewId,
          persona: data.persona,
          ephemeralToken: data.ephemeralToken,
          geminiModel: data.geminiModel,
        });
      } catch (err) {
        console.error("[InterviewPage] Failed to init session:", err);
        setConnectionStatus("error");
      }
    }

    initSession();
  }, [resetCounter]);


  // ── Session timer ────────────────────────────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => setTimer((prev) => prev + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  // ── Autoscroll transcript ────────────────────────────────────────────────────
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ─────────────────────────────────────────────────────────────────────────────
  // Audio Playback — decode 24kHz PCM from Gemini and schedule for gapless play
  // ─────────────────────────────────────────────────────────────────────────────
  const playAudioChunk = useCallback(async (base64Data: string) => {
    try {
      if (!playbackContextRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        playbackContextRef.current = new AudioContextClass();
        nextPlaybackTimeRef.current = playbackContextRef.current.currentTime;
      }

      const ctx = playbackContextRef.current;
      if (ctx.state === "suspended") await ctx.resume();

      // Decode base64 → Int16 PCM → Float32
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);

      const dataView = new DataView(bytes.buffer);
      const sampleCount = len / 2;
      const floatBuffer = new Float32Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        floatBuffer[i] = dataView.getInt16(i * 2, true) / 32768.0;
      }

      const audioBuffer = ctx.createBuffer(1, sampleCount, 24000);
      audioBuffer.getChannelData(0).set(floatBuffer);

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);

      const startTime = Math.max(ctx.currentTime, nextPlaybackTimeRef.current);
      source.start(startTime);
      nextPlaybackTimeRef.current = startTime + audioBuffer.duration;
      activeSourcesRef.current.push(source);

      source.onended = () => {
        activeSourcesRef.current = activeSourcesRef.current.filter((s) => s !== source);
      };
    } catch (e) {
      console.warn("[Audio] Failed to play chunk:", e);
    }
  }, []);

  const stopAllPlayback = useCallback(() => {
    activeSourcesRef.current.forEach((s) => {
      try { s.stop(); } catch (_) {}
    });
    activeSourcesRef.current = [];
    if (playbackContextRef.current) {
      nextPlaybackTimeRef.current = playbackContextRef.current.currentTime;
    }
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Microphone Recording — capture and stream 16kHz PCM directly to Gemini WS
  // ─────────────────────────────────────────────────────────────────────────────
  const startRecording = useCallback((geminiWs: WebSocket, stream: MediaStream) => {
    if (recorderContextRef.current) return;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const audioContext = new AudioContextClass({ sampleRate: 16000 });
    recorderContextRef.current = audioContext;

    const src = audioContext.createMediaStreamSource(stream);
    sourceRef.current = src;

    const processor = audioContext.createScriptProcessor(2048, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (geminiWs.readyState !== WebSocket.OPEN) return;
      const inputData = e.inputBuffer.getChannelData(0);
      const pcm = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        const s = Math.max(-1, Math.min(1, inputData[i]!));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }

      // Send audio directly to Gemini as realtimeInput mediaChunks
      const msg = {
        realtimeInput: {
          mediaChunks: [
            {
              mimeType: "audio/pcm;rate=16000",
              data: btoa(String.fromCharCode(...new Uint8Array(pcm.buffer))),
            },
          ],
        },
      };
      geminiWs.send(JSON.stringify(msg));
    };

    src.connect(processor);
    processor.connect(audioContext.destination);
    console.log("[Client] Audio streaming started at 16kHz PCM → Gemini");
  }, []);

  const stopRecording = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current?.disconnect();
    sourceRef.current = null;
    if (recorderContextRef.current) {
      recorderContextRef.current.close().catch(() => {});
      recorderContextRef.current = null;
    }
    console.log("[Client] Audio streaming stopped");
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Log transcript to backend (non-blocking fire-and-forget)
  // ─────────────────────────────────────────────────────────────────────────────
  const logToBackend = useCallback((interviewId: string, sender: string, text: string) => {
    fetch(`${BACKEND_URL}/api/interviews/${interviewId}/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sender, text }),
    }).catch((err) => console.error("[Log] Failed to persist transcript:", err));
  }, []);

  // ─────────────────────────────────────────────────────────────────────────────
  // Main Gemini WebSocket Connection
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionInfo) return;

    const { interviewId, ephemeralToken, geminiModel } = sessionInfo;

    console.log(`[Client] Connecting to Gemini Live API (${geminiModel})`);
    setConnectionStatus("connecting");

    const wsUrl = `${GEMINI_WS_BASE}?access_token=${encodeURIComponent(ephemeralToken)}`;
    const geminiWs = new WebSocket(wsUrl);
    geminiWsRef.current = geminiWs;

    geminiWs.onopen = () => {
      console.log("[Client] Connected to Gemini Live API");
      setConnectionStatus("connected");
      setAssistantState("listening");

      // Send setup message — model is constrained by the ephemeral token,
      // but we send config for audio format preferences
      const setup = {
        setup: {
          model: geminiModel,
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: "Aoede" },
              },
            },
          },
        },
      };
      geminiWs.send(JSON.stringify(setup));

      // Start streaming mic audio once connected
      if (micOn && streamRef.current) {
        startRecording(geminiWs, streamRef.current);
      }
    };

    geminiWs.onmessage = async (event) => {
      try {
        const response = (await parseGeminiWsMessage(event.data)) as Record<string, unknown>;

        // ── Input transcription (user's spoken words via Gemini STT) ──────────
        if (response.inputTranscription) {
          const { text, turnComplete } = response.inputTranscription as {text: string, turnComplete: string};
          if (text) {
            currentUserUtteranceRef.current += text + " ";
          }
          if (turnComplete) {
            const finalText = currentUserUtteranceRef.current.trim();
            if (finalText) {
              console.log(`[STT User]: ${finalText}`);
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.sender === "user") {
                  return [...prev.slice(0, -1), { ...last, text: finalText }];
                }
                return [
                  ...prev,
                  {
                    sender: "user",
                    text: finalText,
                    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                  },
                ];
              });

              // Persist to backend
              logToBackend(interviewId, "user", finalText);

              // Update metrics
              const words = finalText.split(/\s+/).length;
              const umCount = (finalText.toLowerCase().match(/\b(um|uh|like|so|basically)\b/g) || []).length;
              setMetrics((prev) => ({
                pacing: Math.min(180, Math.max(90, Math.floor((words / 12) * 125))),
                fillers: prev.fillers + umCount,
                clarity: Math.max(75, 98 - umCount * 3),
                structure: finalText.length > 80 ? "STAR - Action" : "STAR - Situation",
              }));
            }
            currentUserUtteranceRef.current = "";
          }
        }

        // ── Server content (assistant's audio + text response) ────────────────
        if (response.serverContent) {
          setAssistantState("speaking");

          const modelTurn = response.serverContent.modelTurn;
          if (modelTurn?.parts) {
            for (const part of modelTurn.parts) {
              // Play audio
              if (part.inlineData?.mimeType?.startsWith("audio/pcm")) {
                await playAudioChunk(part.inlineData.data);
              }
              // Also handle the legacy format
              if (part.mimeType?.startsWith("audio/pcm")) {
                await playAudioChunk(part.data);
              }
              // Append assistant text
              if (part.text) {
                currentAssistantUtteranceRef.current += part.text;
                setMessages((prev) => {
                  const last = prev[prev.length - 1];
                  if (last?.sender === "assistant") {
                    return [...prev.slice(0, -1), { ...last, text: last.text + part.text }];
                  }
                  return [
                    ...prev,
                    {
                      sender: "assistant",
                      text: part.text,
                      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                    },
                  ];
                });
              }
            }
          }

          // Interruption — user started speaking, stop assistant audio
          if (response.serverContent.interrupted) {
            console.log("[Client] Assistant interrupted");
            stopAllPlayback();
            setAssistantState("listening");
            currentAssistantUtteranceRef.current = "";
          }

          // Turn complete — persist assistant utterance to backend
          if (response.serverContent.turnComplete) {
            const finalAssistant = currentAssistantUtteranceRef.current.trim();
            if (finalAssistant) {
              console.log(`[TTS Assistant]: ${finalAssistant}`);
              logToBackend(interviewId, "assistant", finalAssistant);
            }
            currentAssistantUtteranceRef.current = "";
            setAssistantState("listening");
          }
        }

        // ── Output transcription (assistant text via Gemini TTS transcript) ──
        if (response.outputTranscription) {
          const { text, turnComplete } = response.outputTranscription;
          if (text) {
            currentAssistantUtteranceRef.current += text + " ";
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              if (last?.sender === "assistant") {
                return [...prev.slice(0, -1), { ...last, text: last.text + text }];
              }
              return [
                ...prev,
                {
                  sender: "assistant",
                  text,
                  timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                },
              ];
            });
          }
          if (turnComplete) {
            const finalAssistant = currentAssistantUtteranceRef.current.trim();
            if (finalAssistant) {
              logToBackend(interviewId, "assistant", finalAssistant);
            }
            currentAssistantUtteranceRef.current = "";
          }
        }

        // ── Setup complete ──────────────────────────────────────────────────────
        if (response.setupComplete) {
          console.log("[Client] Gemini setup complete, AI is ready");
          setAssistantState("listening");
        }

      } catch (err) {
        console.error("[Client] Error parsing Gemini message:", err);
      }
    };

    geminiWs.onerror = (err) => {
      console.error("[Client] Gemini WebSocket error:", err);
      setConnectionStatus("error");
      setAssistantState("idle");
    };

    geminiWs.onclose = (event) => {
      console.log(`[Client] Gemini WebSocket closed: ${event.code} ${event.reason}`);
      setAssistantState("idle");
      stopRecording();
    };

    return () => {
      if (geminiWs.readyState === WebSocket.OPEN || geminiWs.readyState === WebSocket.CONNECTING) {
        geminiWs.close();
      }
      stopRecording();
      stopAllPlayback();
    };
  }, [sessionInfo, resetCounter]);

  // ── Microphone stream ────────────────────────────────────────────────────────
  useEffect(() => {
    async function startAudio() {
      if (!micOn) {
        stopRecording();
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }
        return;
      }

      setCameraPermission("pending");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        setCameraPermission("granted");

        if (geminiWsRef.current?.readyState === WebSocket.OPEN) {
          startRecording(geminiWsRef.current, stream);
        }
      } catch (err) {
        console.error("Microphone access failed:", err);
        setCameraPermission("denied");
      }
    }

    startAudio();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [micOn]);

  // ── Mic volume meter ─────────────────────────────────────────────────────────
  useEffect(() => {
    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let microphone: MediaStreamAudioSourceNode | null = null;
    let animationFrameId: number;

    if (micOn && streamRef.current && cameraPermission === "granted") {
      try {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        audioContext = new AudioContextClass();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(streamRef.current);
        analyser.fftSize = 64;
        microphone.connect(analyser);

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const updateVolume = () => {
          if (!analyser) return;
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) sum += dataArray[i]!;
          setAudioLevel(Math.min(100, Math.floor((sum / bufferLength / 128) * 100)));
          animationFrameId = requestAnimationFrame(updateVolume);
        };
        updateVolume();
      } catch (e) {
        console.warn("AudioContext setup failed:", e);
      }
    } else {
      setAudioLevel(0);
    }

    return () => {
      if (animationFrameId) cancelAnimationFrame(animationFrameId);
      if (audioContext && audioContext.state !== "closed") audioContext.close();
    };
  }, [micOn, cameraPermission]);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleSubmitAnswer = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!textInput.trim() || !geminiWsRef.current || geminiWsRef.current.readyState !== WebSocket.OPEN) return;

    const msg: Message = {
      sender: "user",
      text: textInput,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setMessages((prev) => [...prev, msg]);

    // Send text turn to Gemini
    geminiWsRef.current.send(
      JSON.stringify({
        clientContent: {
          turns: [{ role: "user", parts: [{ text: textInput }] }],
          turnComplete: true,
        },
      }),
    );

    // Also persist to backend
    if (sessionInfo) {
      logToBackend(sessionInfo.interviewId, "user", textInput);
    }

    setTextInput("");
  };

  const handleEndInterview = () => {
    if (sessionInfo) {
      fetch(`${BACKEND_URL}/api/interviews/${sessionInfo.interviewId}/end`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).catch((err) => console.error("[End] Failed to end interview:", err));
    }

    if (geminiWsRef.current?.readyState === WebSocket.OPEN) {
      geminiWsRef.current.close();
    }
    stopRecording();
    stopAllPlayback();
    onExit();
  };

  const handleResetSession = () => {
    stopRecording();
    stopAllPlayback();
    setMessages([]);
    setTimer(0);
    setAssistantState("idle");
    setSessionInfo(null);
    setResetCounter((prev) => prev + 1);
  };

  // ── Utility helpers ───────────────────────────────────────────────────────────
  const formatTime = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  const getEqualizerStyle = (index: number) => {
    if (!micOn) return { height: "3px" };
    const multiplier = 0.3 + index * 0.12;
    return {
      height: `${Math.min(20, Math.max(3, Math.floor(audioLevel * multiplier)))}px`,
      transition: "height 0.08s ease",
    };
  };

  const getOrbStateConfig = () => {
    switch (assistantState) {
      case "listening":
        return {
          gradient: "from-[#0D9488] via-[#06B6D4] to-[#3B82F6]",
          scale: "scale-105",
          ringColor: "border-[#06B6D4]/30",
          shadowColor: "shadow-[0_0_50px_20px_rgba(6,182,212,0.35)]",
          label: "LISTENING",
        };
      case "thinking":
        return {
          gradient: "from-[#6366F1] via-[#8B5CF6] to-[#EC4899]",
          scale: "scale-100 rotate-180",
          ringColor: "border-[#8B5CF6]/30",
          shadowColor: "shadow-[0_0_50px_20px_rgba(139,92,246,0.35)]",
          label: "THINKING",
        };
      case "speaking":
        return {
          gradient: "from-[#C17F3B] via-[#D18F4B] to-[#EF4444]",
          scale: "scale-110",
          ringColor: "border-[#C17F3B]/30",
          shadowColor: "shadow-[0_0_60px_25px_rgba(193,127,59,0.35)]",
          label: "SPEAKING",
        };
      default:
        return {
          gradient: "from-[#8E877F] via-[#A8A095] to-[#C0B7AB]",
          scale: "scale-95",
          ringColor: "border-[#0B0909]/20",
          shadowColor: "shadow-[0_0_30px_10px_rgba(11,9,9,0.05)]",
          label: connectionStatus === "connecting" ? "CONNECTING" : connectionStatus === "error" ? "ERROR" : "STANDBY",
        };
    }
  };

  const orbConfig = getOrbStateConfig();

  const personaName = sessionInfo?.persona === "marcus"
    ? "Marcus Vance"
    : sessionInfo?.persona === "sarah"
      ? "Sarah Chen"
      : "Elena Rostova";

  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div
      className="flex flex-col h-screen max-h-screen bg-[#FBEFEF] bg-cover bg-center overflow-y-auto overflow-x-hidden no-scrollbar relative font-sans text-[#0B0909]"
      style={{ backgroundImage: `url(${bgHero})` }}
    >
      <style dangerouslySetInnerHTML={{ __html: customStyles }} />

      {/* Backdrop */}
      <div className="absolute inset-0 bg-[#FBEFEF]/30 backdrop-blur-[0.5px] pointer-events-none" />

      {/* Header */}
      <header className="flex justify-between items-center px-6 py-4 border-b-2 border-[#0B0909] bg-[#FBEFEF]/95 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-3.5">
          <button
            onClick={() => { playAestheticClick(); handleEndInterview(); }}
            className="flex items-center justify-center p-2 rounded-xl bg-[#EEEEEE] hover:bg-neutral-200 border-2 border-[#0B0909] shadow-[2px_2px_0px_0px_#0B0909] transition-all active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_#0B0909] text-[#0B0909] cursor-pointer"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-[0.2em] text-[#0B0909] font-extrabold">Mockview</span>
            <span className="text-sm font-bold text-[#0B0909]">AI Interview Simulator</span>
          </div>
        </div>

        <div className="flex items-center gap-4 sm:gap-6">
          <div className="hidden sm:flex items-center gap-2 bg-[#EEEEEE] border-2 border-[#0B0909] shadow-[2px_2px_0px_0px_#0B0909] rounded-full py-1.5 px-3">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${connectionStatus === "connected" ? "bg-emerald-500" : connectionStatus === "error" ? "bg-red-500" : "bg-amber-500"}`} />
              <span className={`relative inline-flex rounded-full h-2 w-2 ${connectionStatus === "connected" ? "bg-emerald-500" : connectionStatus === "error" ? "bg-red-500" : "bg-amber-500"}`} />
            </span>
            <span className={`text-[10px] font-extrabold uppercase tracking-wider ${connectionStatus === "connected" ? "text-emerald-700" : connectionStatus === "error" ? "text-red-700" : "text-amber-700"}`}>
              {connectionStatus === "connected" ? "LIVE" : connectionStatus === "error" ? "ERROR" : "CONNECTING"}
            </span>
            <div className="w-[1px] h-3 bg-[#0B0909]/30 mx-1" />
            <Clock className="size-3.5 text-[#0B0909]" />
            <span className="text-xs font-mono font-bold text-[#0B0909]">{formatTime(timer)}</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-[#0B0909] font-bold">
            <Wifi className="size-3.5 text-emerald-600 animate-pulse" />
            <span>Direct</span>
          </div>

          <Button
            variant="destructive"
            size="sm"
            onClick={() => { playAestheticClick(); handleEndInterview(); }}
            className="rounded-xl h-9 px-4 font-bold border-2 border-[#0B0909] bg-[#0B0909] text-[#FBEFEF] hover:bg-[#0B0909]/95 transition-all active:scale-[0.98] cursor-pointer shadow-[2px_2px_0px_0px_#EEEEEE]"
          >
            End Interview
          </Button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-center justify-center p-6 max-w-2xl mx-auto w-full relative z-10">
        <section className="flex flex-col gap-5 w-full">
          <Card className="bg-[#FBEFEF]/95 border-2 border-[#0B0909] shadow-[6px_6px_0px_0px_#0B0909] flex flex-col justify-between overflow-hidden h-[550px] py-5 rounded-3xl text-[#0B0909]">

            {/* Card Header */}
            <div className="border-b-2 border-[#0B0909]/20 pb-4 px-6 flex flex-wrap justify-between items-center gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-[#0B0909]/70 font-extrabold">Interviewer Profile</span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-[#0B0909]">{personaName}</span>
                  <button
                    type="button"
                    onClick={() => { playAestheticClick(); handleResetSession(); }}
                    className="flex items-center justify-center size-8 rounded-xl bg-[#EEEEEE] hover:bg-neutral-200 border-2 border-[#0B0909] text-[#0B0909] shadow-[1px_1px_0px_0px_#0B0909] transition-all active:translate-y-[1px] active:shadow-none cursor-pointer"
                    title="Restart Interview Session"
                  >
                    <RotateCcw className="size-3.5" />
                  </button>
                </div>
              </div>

              {/* Mic & AI Status */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-[#EEEEEE] px-3 py-1.5 rounded-xl border-2 border-[#0B0909] shadow-sm h-8">
                  <button
                    type="button"
                    onClick={() => { playAestheticClick(); setMicOn(!micOn); }}
                    className="p-0.5 rounded-md transition-colors cursor-pointer text-[#0B0909] hover:bg-[#0B0909]/5"
                    title={micOn ? "Mute Microphone" : "Unmute Microphone"}
                  >
                    {micOn ? <Mic className="size-3.5" /> : <MicOff className="size-3.5" />}
                  </button>
                  <div className="flex items-end gap-[2px] h-4">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} style={getEqualizerStyle(i)} className="w-1 bg-[#0B0909] rounded-full" />
                    ))}
                  </div>
                </div>

                <div className="flex flex-col items-end">
                  <span className="inline-flex items-center gap-1.5 text-xs font-extrabold px-2.5 py-1 rounded-full border-2 border-[#0B0909] bg-[#EEEEEE]">
                    <span className={`size-1.5 rounded-full ${
                      assistantState === "listening" ? "bg-cyan-500 animate-ping" :
                      assistantState === "thinking" ? "bg-indigo-500 animate-spin" :
                      assistantState === "speaking" ? "bg-amber-500 animate-pulse" :
                      "bg-[#0B0909]"
                    }`} />
                    {orbConfig.label}
                  </span>
                </div>
              </div>
            </div>

            {/* Orb Visualizer */}
            <div className="flex-1 flex flex-col justify-center items-center py-6 relative">
              <div className="absolute size-52 rounded-full bg-transparent flex items-center justify-center pointer-events-none">
                {assistantState !== "idle" && (
                  <>
                    <div className={`absolute inset-0 rounded-full border-2 ${orbConfig.ringColor} ripple-effect`} />
                    <div className={`absolute inset-0 rounded-full border-2 ${orbConfig.ringColor} ripple-effect`} style={{ animationDelay: "1.2s" }} />
                  </>
                )}
              </div>

              <div className={`absolute size-40 rounded-full bg-gradient-to-tr ${orbConfig.gradient} blur-2xl opacity-20 transition-all duration-700 ${orbConfig.shadowColor} ${orbConfig.scale}`} />

              <div className={`relative size-24 bg-gradient-to-tr ${orbConfig.gradient} shadow-md transition-all duration-700 morphing-orb ${orbConfig.scale} flex items-center justify-center border-2 border-[#0B0909]/20`}>
                <div className="absolute inset-1.5 rounded-full bg-white/20 backdrop-blur-[1px] border border-white/30" />

                {assistantState === "speaking" && (
                  <div className="flex items-center gap-1 relative z-10">
                    <span className="w-1 h-5 bg-white rounded-full animate-pulse" />
                    <span className="w-1 h-8 bg-white rounded-full animate-pulse" style={{ animationDelay: "0.2s" }} />
                    <span className="w-1 h-4 bg-white rounded-full animate-pulse" style={{ animationDelay: "0.4s" }} />
                  </div>
                )}
                {assistantState === "listening" && (
                  <div className="relative z-10">
                    <span className="flex size-3 items-center justify-center">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-40 animate-ping" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                    </span>
                  </div>
                )}
              </div>

              <span className="text-[10px] text-[#0B0909]/70 mt-5 tracking-wide max-w-[220px] text-center font-bold">
                {assistantState === "idle" && connectionStatus === "connecting" && "Connecting to Gemini..."}
                {assistantState === "idle" && connectionStatus === "error" && "Connection failed. Try restarting."}
                {assistantState === "idle" && connectionStatus === "connected" && "Initializing... start speaking"}
                {assistantState === "listening" && "Listening to you... Speak now"}
                {assistantState === "thinking" && `${personaName} is evaluating...`}
                {assistantState === "speaking" && `${personaName} is speaking`}
              </span>
            </div>

            {/* Transcript */}
            <div className="h-[150px] px-6 overflow-hidden overflow-y-auto no-scrollbar space-y-3.5 border-t border-b-2 border-[#0B0909]/20 py-4 bg-[#EEEEEE]/30">
              {messages.length === 0 && (
                <p className="text-[10px] text-[#0B0909]/40 text-center font-medium mt-4">
                  Transcript will appear here once the interview begins...
                </p>
              )}
              {messages.map((msg, index) => (
                <div key={index} className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[9px] uppercase tracking-wider text-[#0B0909]/70 font-bold">
                      {msg.sender === "user" ? "Candidate" : personaName}
                    </span>
                    <span className="text-[8px] text-neutral-500">{msg.timestamp}</span>
                  </div>
                  <div className={`text-xs px-3.5 py-2.5 rounded-2xl max-w-[85%] leading-relaxed break-words overflow-hidden ${
                    msg.sender === "user"
                      ? "bg-[#0B0909] text-[#FBEFEF] border border-[#0B0909] rounded-tr-none shadow-sm"
                      : "bg-[#EEEEEE] border-2 border-[#0B0909] text-[#0B0909] rounded-tl-none shadow-sm"
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>

            {/* Text Input */}
            <form onSubmit={handleSubmitAnswer} className="pt-4 px-6 flex items-center gap-2">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={assistantState === "listening" ? "Type your response here..." : "Wait for AI or type answer..."}
                disabled={assistantState === "thinking" || connectionStatus !== "connected"}
                className="flex-1 bg-white border-2 border-[#0B0909] rounded-xl text-xs py-2.5 px-3.5 text-[#0B0909] placeholder-[#0B0909]/40 focus:outline-none focus:border-[#0B0909] focus:ring-1 focus:ring-[#0B0909]/40 disabled:opacity-50 transition-colors"
              />
              <button
                type="submit"
                onClick={playAestheticClick}
                disabled={!textInput.trim() || assistantState === "thinking" || connectionStatus !== "connected"}
                className="flex items-center justify-center p-2.5 rounded-xl bg-[#0B0909] hover:bg-[#0B0909]/95 text-[#FBEFEF] border border-[#0B0909] transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer shadow-[2px_2px_0px_0px_#EEEEEE]"
              >
                <Send className="size-3.5" />
              </button>
            </form>

          </Card>
        </section>
      </main>
    </div>
  );
}

export default InterviewPage;
