import React, { useState, useEffect, useRef } from "react";
import { 
  Mic, 
  MicOff, 
  Clock, 
  ArrowLeft, 
  Wifi, 
  Send, 
  RotateCcw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import bgHero from "./assets/bg_hero.jpg";
import { playAestheticClick } from "./lib/utils";

// CSS Animations as inline style tag to guarantee custom visual effects work in this template
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
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
`;

type AssistantState = "idle" | "listening" | "thinking" | "speaking";

interface Message {
  sender: "assistant" | "user";
  text: string;
  timestamp: string;
}

interface Persona {
  id: string;
  name: string;
  role: string;
  description: string;
  color: string;
  initialPrompt: string;
  questions: string[];
}

const PERSONAS: Persona[] = [
  {
    id: "elena",
    name: "Elena Rostova",
    role: "System Design Expert",
    description: "Former Principal Architect focusing on microservices, CDNs, databases, and high availability systems.",
    color: "from-amber-500 via-orange-500 to-yellow-500",
    initialPrompt: "Hello! Welcome to your Mockview System Design interview. I'm Elena, and I'll be conducting this session. Today, we'll design a high-throughput, low-latency live video streaming platform like Twitch. To start, how would you approach the high-level architecture?",
    questions: [
      "That's a good high-level breakdown. Let's drill into transcoding. Live video transcoding is extremely compute-heavy. How would you design a scalable transcoding pipeline, and how would you handle sudden spikes in active streamers?",
      "Kafka queue lag is a great metric to scale on. Now, how would you design the database and caching system to handle real-time chat with millions of concurrent viewers in a single channel?",
      "Excellent. How would you handle a 'hot channel' problem, where one channel has 5 million viewers and is overloading a single Redis pub/sub node or database partition?",
      "Great solutions. I think we have covered the streaming ingestion and chat scale. To conclude, how would you approach CDN edge caching configuration for video chunks to optimize global time-to-first-byte (TTFB)?"
    ]
  },
  {
    id: "marcus",
    name: "Marcus Vance",
    role: "HR Behavioral Lead",
    description: "Specializes in organizational leadership, interpersonal alignment, conflict resolution, and the STAR framework.",
    color: "from-teal-400 via-emerald-500 to-cyan-500",
    initialPrompt: "Hi there, I'm Marcus. Thanks for joining today. We'll be walking through some behavioral scenarios. Can you start by telling me about a time when you had to resolve a significant conflict with a team member or stakeholder on a tight deadline?",
    questions: [
      "Interesting scenario. How did you balance maintaining the team relationship with ensuring the project actually got delivered on time?",
      "That's a vital compromise. Now, tell me about a time you failed to meet a goal. What happened, what did you learn, and how did you apply that learning in your next project?",
      "Thank you for sharing that. Self-reflection is key. Finally, how do you handle situations where your manager assigns a project with highly ambiguous requirements?"
    ]
  },
  {
    id: "sarah",
    name: "Sarah Chen",
    role: "Frontend Tech Lead",
    description: "Focuses on browser rendering lifecycle, state management optimization, CSS architectures, and React 19 features.",
    color: "from-indigo-500 via-purple-500 to-pink-500",
    initialPrompt: "Welcome! I'm Sarah, and we'll dive into frontend engineering and application design. Let's start: can you explain how React 19 Server Components and Suspense work under the hood to improve performance and bundle sizes?",
    questions: [
      "Good explanation. Let's talk state management. How would you structure global state in a rich, real-time collaboration canvas app, avoiding unnecessary re-renders in deep component trees?",
      "Excellent. If a client-side layout is experiencing input lag and sluggish animations when rendering a list of 10,000 items with interactive search, what performance optimization techniques would you apply?",
      "Nice. Lastly, how does browser rendering pipelining (Style, Layout, Paint, Composite) influence how you write animations, and when would you choose CSS transformations over JS-driven animations?"
    ]
  }
];

export function InterviewPage({ onExit }: { onExit: () => void }) {
  // Config States
  const [selectedPersona, setSelectedPersona] = useState<Persona>(PERSONAS[0]!);
  const [assistantState, setAssistantState] = useState<AssistantState>("idle");
  const [timer, setTimer] = useState(0);
  const [resetCounter, setResetCounter] = useState(0);

  // User media states
  const [micOn, setMicOn] = useState(true);
  const [cameraPermission, setCameraPermission] = useState<"pending" | "granted" | "denied">("pending");
  const [audioLevel, setAudioLevel] = useState(0);

  // Chat & responses state
  const [textInput, setTextInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);

  // Feedback Metrics (computed dynamically from actual voice transcripts)
  const [metrics, setMetrics] = useState({
    pacing: 0, // WPM
    fillers: 0,
    clarity: 98, // %
    structure: "Not Started"
  });

  const streamRef = useRef<MediaStream | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // WebSocket and Audio Refs
  const wsRef = useRef<WebSocket | null>(null);
  const recorderContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const playbackContextRef = useRef<AudioContext | null>(null);
  const nextPlaybackTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  // Session timer count up
  useEffect(() => {
    const interval = setInterval(() => {
      setTimer(prev => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Format timer
  const formatTime = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Autoscroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Audio Playback scheduler for 24kHz PCM chunks from Gemini
  const playAudioChunk = async (base64Data: string) => {
    try {
      if (!playbackContextRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        playbackContextRef.current = new AudioContextClass();
        nextPlaybackTimeRef.current = playbackContextRef.current.currentTime;
      }
      
      const ctx = playbackContextRef.current;
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const dataView = new DataView(bytes.buffer);
      const sampleCount = len / 2;
      const floatBuffer = new Float32Array(sampleCount);
      for (let i = 0; i < sampleCount; i++) {
        const int16 = dataView.getInt16(i * 2, true);
        floatBuffer[i] = int16 / 32768.0;
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
        activeSourcesRef.current = activeSourcesRef.current.filter(src => src !== source);
      };
    } catch (e) {
      console.warn("Failed to play audio chunk:", e);
    }
  };

  const stopAllPlayback = () => {
    activeSourcesRef.current.forEach(source => {
      try {
        source.stop();
      } catch (e) {}
    });
    activeSourcesRef.current = [];
    if (playbackContextRef.current) {
      nextPlaybackTimeRef.current = playbackContextRef.current.currentTime;
    }
  };

  // Audio Recording (capture, resample to 16kHz PCM mono and stream)
  const startRecording = (ws: WebSocket, stream: MediaStream) => {
    try {
      if (recorderContextRef.current) return;
      
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioContext = new AudioContextClass({ sampleRate: 16000 });
      recorderContextRef.current = audioContext;
      
      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;
      
      const processor = audioContext.createScriptProcessor(2048, 1, 1);
      processorRef.current = processor;
      
      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const inputData = e.inputBuffer.getChannelData(0);
        
        const pcmBuffer = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          const s = Math.max(-1, Math.min(1, inputData[i]!));
          pcmBuffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        ws.send(pcmBuffer.buffer);
      };
      
      source.connect(processor);
      processor.connect(audioContext.destination);
      console.log("[Client] Started audio streaming at 16kHz PCM");
    } catch (err) {
      console.error("[Client] Failed to start audio streaming:", err);
    }
  };

  const stopRecording = () => {
    if (processorRef.current) {
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceRef.current) {
      sourceRef.current.disconnect();
      sourceRef.current = null;
    }
    if (recorderContextRef.current) {
      recorderContextRef.current.close().catch(() => {});
      recorderContextRef.current = null;
    }
    console.log("[Client] Stopped audio streaming");
  };

  // WebSocket Connection Lifecycle
  useEffect(() => {
    const queryParams = new URLSearchParams(window.location.search);
    const id = queryParams.get("id");
    if (!id) {
      alert("No Interview Session ID found. Returning to welcome page.");
      onExit();
      return;
    }

    console.log(`[Client] Initializing WebSocket session for ${id}`);
    const ws = new WebSocket(`ws://localhost:3001/api/interviews/${id}?persona=${selectedPersona.id}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[Client] WebSocket opened");
      if (micOn && streamRef.current) {
        startRecording(ws, streamRef.current);
      }
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        
        switch (payload.type) {
          case "status":
            setAssistantState(payload.status);
            break;
          case "audio":
            playAudioChunk(payload.data);
            break;
          case "text":
            // Append incoming assistant text chunks
            setMessages(prev => {
              const lastMsg = prev[prev.length - 1];
              if (lastMsg && lastMsg.sender === "assistant") {
                return [
                  ...prev.slice(0, -1),
                  { ...lastMsg, text: lastMsg.text + payload.text }
                ];
              } else {
                return [
                  ...prev,
                  {
                    sender: "assistant",
                    text: payload.text,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  }
                ];
              }
            });
            break;
          case "user_transcript": {
            const text = payload.text;
            setMessages(prev => {
              const lastMsg = prev[prev.length - 1];
              if (lastMsg && lastMsg.sender === "user") {
                return [
                  ...prev.slice(0, -1),
                  { ...lastMsg, text }
                ];
              } else {
                return [
                  ...prev,
                  {
                    sender: "user",
                    text,
                    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                  }
                ];
              }
            });

            // Update real-time feedback metrics from actual user transcript
            const words = text.split(/\s+/).length;
            const currentPacing = Math.min(180, Math.max(90, Math.floor((words / 12) * 125)));
            const umCount = (text.toLowerCase().match(/\b(um|uh|like|so|basically)\b/g) || []).length;
            setMetrics(prev => ({
              pacing: currentPacing,
              fillers: prev.fillers + umCount,
              clarity: Math.max(75, 98 - (umCount * 3)),
              structure: text.length > 80 ? "STAR - Action" : "STAR - Situation"
            }));
            break;
          }
          case "interrupted":
            console.log("[Client] Assistant interrupted by user speak");
            stopAllPlayback();
            setAssistantState("listening");
            break;
          case "error":
            console.error("[Client] Backend error:", payload.message);
            alert(`Error: ${payload.message}`);
            break;
        }
      } catch (err) {
        console.error("[Client] Error parsing WebSocket message:", err);
      }
    };

    ws.onclose = () => {
      console.log("[Client] WebSocket closed");
      setAssistantState("idle");
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close();
      }
      stopRecording();
      stopAllPlayback();
      setMessages([]);
      setTimer(0);
    };
  }, [selectedPersona.id, resetCounter]);

  // Request & Bind Microphone Stream ONLY
  useEffect(() => {
    async function startAudio() {
      if (!micOn) {
        stopRecording();
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        return;
      }

      setCameraPermission("pending");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true
        });
        
        streamRef.current = stream;
        setCameraPermission("granted");
        
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          startRecording(wsRef.current, stream);
        }
      } catch (err) {
        console.error("Microphone access failed:", err);
        setCameraPermission("denied");
      }
    }

    startAudio();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [micOn]);

  // Microphone Audio Level Meter (Web Audio API)
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
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i]!;
          }
          const average = sum / bufferLength;
          setAudioLevel(Math.min(100, Math.floor((average / 128) * 100)));
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
      if (audioContext && audioContext.state !== "closed") {
        audioContext.close();
      }
    };
  }, [micOn, cameraPermission]);

  // Handle user response submission
  const handleSubmitAnswer = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!textInput.trim() || !wsRef.current) return;

    // 1. Add user message locally
    const newMsg: Message = {
      sender: "user",
      text: textInput,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages(prev => [...prev, newMsg]);

    // 2. Send text to backend WebSocket
    wsRef.current.send(JSON.stringify({ type: "text", text: textInput }));
    setTextInput("");
  };

  // End Interview and notify backend to save status
  const handleEndInterview = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "end" }));
    }
    stopRecording();
    stopAllPlayback();
    onExit();
  };

  const handleResetSession = () => {
    setResetCounter(prev => prev + 1);
  };

  const getEqualizerStyle = (index: number) => {
    if (!micOn) return { height: "3px" };
    const multiplier = 0.3 + (index * 0.12);
    const heightVal = Math.max(3, Math.floor(audioLevel * multiplier));
    return {
      height: `${Math.min(20, heightVal)}px`,
      transition: "height 0.08s ease"
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
          label: "LISTENING"
        };
      case "thinking":
        return {
          gradient: "from-[#6366F1] via-[#8B5CF6] to-[#EC4899]",
          scale: "scale-100 rotate-180",
          ringColor: "border-[#8B5CF6]/30",
          shadowColor: "shadow-[0_0_50px_20px_rgba(139,92,246,0.35)]",
          label: "THINKING"
        };
      case "speaking":
        return {
          gradient: "from-[#C17F3B] via-[#D18F4B] to-[#EF4444]",
          scale: "scale-110",
          ringColor: "border-[#C17F3B]/30",
          shadowColor: "shadow-[0_0_60px_25px_rgba(193,127,59,0.35)]",
          label: "SPEAKING"
        };
      case "idle":
      default:
        return {
          gradient: "from-[#8E877F] via-[#A8A095] to-[#C0B7AB]",
          scale: "scale-95",
          ringColor: "border-[#0B0909]/20",
          shadowColor: "shadow-[0_0_30px_10px_rgba(11,9,9,0.05)]",
          label: "STANDBY"
        };
    }
  };

  const orbConfig = getOrbStateConfig();

  return (
    <div 
      className="flex flex-col h-screen max-h-screen bg-[#FBEFEF] bg-cover bg-center overflow-y-auto overflow-x-hidden no-scrollbar relative font-sans text-[#0B0909]"
      style={{ backgroundImage: `url(${bgHero})` }}
    >
      <style dangerouslySetInnerHTML={{ __html: customStyles }} />

      {/* Backdrop glass layer */}
      <div className="absolute inset-0 bg-[#FBEFEF]/30 backdrop-blur-[0.5px] pointer-events-none" />

      {/* Top Header */}
      <header className="flex justify-between items-center px-6 py-4 border-b-2 border-[#0B0909] bg-[#FBEFEF]/95 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-3.5">
          <button 
            onClick={() => {
              playAestheticClick();
              handleEndInterview();
            }}
            className="flex items-center justify-center p-2 rounded-xl bg-[#EEEEEE] hover:bg-neutral-200 border-2 border-[#0B0909] shadow-[2px_2px_0px_0px_#0B0909] transition-all active:translate-y-[1px] active:shadow-[1px_1px_0px_0px_#0B0909] text-[#0B0909] cursor-pointer"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-[0.2em] text-[#0B0909] font-extrabold">Mockview</span>
            <span className="text-sm font-bold text-[#0B0909]">AI Interview Simulator</span>
          </div>
        </div>

        {/* Live Timer & Connection Status */}
        <div className="flex items-center gap-4 sm:gap-6">
          <div className="hidden sm:flex items-center gap-2 bg-[#EEEEEE] border-2 border-[#0B0909] shadow-[2px_2px_0px_0px_#0B0909] rounded-full py-1.5 px-3">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[10px] font-extrabold text-emerald-700 uppercase tracking-wider">LIVE</span>
            <div className="w-[1px] h-3 bg-[#0B0909]/30 mx-1" />
            <Clock className="size-3.5 text-[#0B0909]" />
            <span className="text-xs font-mono font-bold text-[#0B0909]">{formatTime(timer)}</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-[#0B0909] font-bold">
            <Wifi className="size-3.5 text-emerald-600 animate-pulse" />
            <span>124ms</span>
          </div>

          <Button 
            variant="destructive"
            size="sm"
            onClick={() => {
              playAestheticClick();
              handleEndInterview();
            }}
            className="rounded-xl h-9 px-4 font-bold border-2 border-[#0B0909] bg-[#0B0909] text-[#FBEFEF] hover:bg-[#0B0909]/95 transition-all active:scale-[0.98] cursor-pointer shadow-[2px_2px_0px_0px_#EEEEEE]"
          >
            End Interview
          </Button>
        </div>
      </header>

      {/* Main Centered Content Layout (No Camera Feed) */}
      <main className="flex-1 flex items-center justify-center p-6 max-w-2xl mx-auto w-full relative z-10">
        <section className="flex flex-col gap-5 w-full">
          <Card className="bg-[#FBEFEF]/95 border-2 border-[#0B0909] shadow-[6px_6px_0px_0px_#0B0909] flex flex-col justify-between overflow-hidden h-[550px] py-5 rounded-3xl text-[#0B0909]">
            
            {/* Header: Select Persona & Status / Candidate Mic */}
            <div className="border-b-2 border-[#0B0909]/20 pb-4 px-6 flex flex-wrap justify-between items-center gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-[10px] uppercase tracking-wider text-[#0B0909]/70 font-extrabold">Interviewer Profile</span>
                <div className="flex items-center gap-2">
                  <Select
                    value={selectedPersona.id}
                    onValueChange={(val) => {
                      playAestheticClick();
                      const found = PERSONAS.find(p => p.id === val);
                      if (found) setSelectedPersona(found);
                    }}
                  >
                    <SelectTrigger className="w-[150px] border-2 border-[#0B0909] text-xs bg-[#EEEEEE] hover:bg-[#EEEEEE]/90 text-[#0B0909] font-bold cursor-pointer rounded-xl h-8">
                      <SelectValue placeholder="Select Interviewer" />
                    </SelectTrigger>
                    <SelectContent className="bg-[#FBEFEF] border-2 border-[#0B0909] text-[#0B0909] rounded-xl">
                      {PERSONAS.map(p => (
                        <SelectItem key={p.id} value={p.id} className="cursor-pointer hover:bg-[#EEEEEE]/40 focus:bg-[#EEEEEE]/40 rounded-lg">
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <button 
                    type="button"
                    onClick={() => {
                      playAestheticClick();
                      handleResetSession();
                    }}
                    className="flex items-center justify-center size-8 rounded-xl bg-[#EEEEEE] hover:bg-neutral-200 border-2 border-[#0B0909] text-[#0B0909] shadow-[1px_1px_0px_0px_#0B0909] transition-all active:translate-y-[1px] active:shadow-none cursor-pointer"
                    title="Restart Interview Session"
                  >
                    <RotateCcw className="size-3.5" />
                  </button>
                </div>
              </div>

              {/* Mic & AI Status widget */}
              <div className="flex items-center gap-3">
                {/* Candidate Mic Equalizer Widget */}
                <div className="flex items-center gap-2 bg-[#EEEEEE] px-3 py-1.5 rounded-xl border-2 border-[#0B0909] shadow-sm h-8">
                  <button
                    type="button"
                    onClick={() => {
                      playAestheticClick();
                      setMicOn(!micOn);
                    }}
                    className={`p-0.5 rounded-md transition-colors cursor-pointer text-[#0B0909] hover:bg-[#0B0909]/5`}
                    title={micOn ? "Mute Microphone" : "Unmute Microphone"}
                  >
                    {micOn ? <Mic className="size-3.5" /> : <MicOff className="size-3.5" />}
                  </button>
                  <div className="flex items-end gap-[2px] h-4">
                    {[...Array(5)].map((_, i) => (
                      <div 
                        key={i} 
                        style={getEqualizerStyle(i)}
                        className="w-1 bg-[#0B0909] rounded-full"
                      />
                    ))}
                  </div>
                </div>

                {/* AI Status Badge */}
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

            {/* Orb Visualizer Display */}
            <div className="flex-1 flex flex-col justify-center items-center py-6 relative">
              {/* Outer Pulsing Background Circles */}
              <div className="absolute size-52 rounded-full bg-transparent flex items-center justify-center pointer-events-none">
                {assistantState !== "idle" && (
                  <>
                    <div className={`absolute inset-0 rounded-full border-2 ${orbConfig.ringColor} ripple-effect`} />
                    <div className={`absolute inset-0 rounded-full border-2 ${orbConfig.ringColor} ripple-effect`} style={{ animationDelay: "1.2s" }} />
                  </>
                )}
              </div>

              {/* Glow backdrop */}
              <div className={`absolute size-40 rounded-full bg-gradient-to-tr ${orbConfig.gradient} blur-2xl opacity-20 transition-all duration-700 ${orbConfig.shadowColor} ${orbConfig.scale}`} />

              {/* The Interactive Orb */}
              <div className={`relative size-24 bg-gradient-to-tr ${orbConfig.gradient} shadow-md transition-all duration-700 morphing-orb ${orbConfig.scale} flex items-center justify-center border-2 border-[#0B0909]/20`}>
                {/* Inner transparent filter */}
                <div className="absolute inset-1.5 rounded-full bg-white/20 backdrop-blur-[1px] border border-white/30" />
                
                {/* Micro animations of voice frequencies inside the speaking state */}
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

              {/* Help tip text below the orb */}
              <span className="text-[10px] text-[#0B0909]/70 mt-5 tracking-wide max-w-[220px] text-center font-bold">
                {assistantState === "idle" && "Initializing... start speaking"}
                {assistantState === "listening" && "Listening to you... Speak now"}
                {assistantState === "thinking" && `${selectedPersona.name} is evaluating...`}
                {assistantState === "speaking" && `${selectedPersona.name} is speaking`}
              </span>
            </div>

            {/* Transcript log list */}
            <div className="h-[150px] px-6 overflow-hidden overflow-y-auto no-scrollbar space-y-3.5 border-t border-b-2 border-[#0B0909]/20 py-4 bg-[#EEEEEE]/30">
              {messages.map((msg, index) => (
                <div 
                  key={index} 
                  className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[9px] uppercase tracking-wider text-[#0B0909]/70 font-bold">
                      {msg.sender === "user" ? "Candidate" : selectedPersona.name}
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

            {/* Input Submission Area */}
            <form onSubmit={handleSubmitAnswer} className="pt-4 px-6 flex items-center gap-2">
              <input
                type="text"
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                placeholder={assistantState === "listening" ? "Type your response here..." : "Wait for AI or type answer..."}
                disabled={assistantState === "thinking"}
                className="flex-1 bg-white border-2 border-[#0B0909] rounded-xl text-xs py-2.5 px-3.5 text-[#0B0909] placeholder-[#0B0909]/40 focus:outline-none focus:border-[#0B0909] focus:ring-1 focus:ring-[#0B0909]/40 disabled:opacity-50 transition-colors"
              />
              <button
                type="submit"
                onClick={playAestheticClick}
                disabled={!textInput.trim() || assistantState === "thinking"}
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
