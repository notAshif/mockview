import React, { useState, useEffect, useRef } from "react";
import { 
  Camera, 
  CameraOff, 
  Mic, 
  MicOff, 
  Monitor, 
  Settings, 
  Volume2, 
  VolumeX, 
  Clock, 
  ArrowLeft, 
  Wifi, 
  Send, 
  Sparkles, 
  Activity, 
  CheckCircle2, 
  AlertCircle,
  Sliders,
  Play,
  RotateCcw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

  // User media states
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [cameraPermission, setCameraPermission] = useState<"pending" | "granted" | "denied">("pending");
  const [audioLevel, setAudioLevel] = useState(0);

  // Chat & responses state
  const [textInput, setTextInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  // Feedback Metrics (simulated dynamically)
  const [metrics, setMetrics] = useState({
    pacing: 140, // WPM
    fillers: 0,
    clarity: 95, // %
    structure: "Not Started"
  });

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Load Initial Persona Prompt
  useEffect(() => {
    setMessages([
      {
        sender: "assistant",
        text: selectedPersona.initialPrompt,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setAssistantState("speaking");
    setCurrentQuestionIndex(0);
    setMetrics({
      pacing: 0,
      fillers: 0,
      clarity: 98,
      structure: "STAR - Hook"
    });
  }, [selectedPersona]);

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

  // Request & Bind Webcam
  useEffect(() => {
    async function startCamera() {
      // If camera is disabled, clean up previous streams
      if (!cameraOn) {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        return;
      }

      setCameraPermission("pending");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: micOn
        });
        
        streamRef.current = stream;
        setCameraPermission("granted");
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Camera access failed:", err);
        setCameraPermission("denied");
      }
    }

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraOn]);

  // Microphone Audio Level Meter (Web Audio API)
  useEffect(() => {
    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let microphone: MediaStreamAudioSourceNode | null = null;
    let javascriptNode: ScriptProcessorNode | null = null;
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
          // Scale from 0-255 to 0-100
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
    if (!textInput.trim()) return;

    // 1. Add user message
    const newMsg: Message = {
      sender: "user",
      text: textInput,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    setMessages(prev => [...prev, newMsg]);
    const responseText = textInput;
    setTextInput("");

    // 2. Change AI state to listening, then thinking
    setAssistantState("listening");
    
    // Simulate real-time metrics parsing
    const wordCount = responseText.split(/\s+/).length;
    const currentPacing = Math.min(180, Math.max(90, Math.floor((wordCount / 10) * 140)));
    const umCount = (responseText.toLowerCase().match(/\b(um|uh|like|so|basically)\b/g) || []).length;
    
    setTimeout(() => {
      setAssistantState("thinking");
      
      // Update stats based on user response
      setMetrics(prev => ({
        pacing: currentPacing,
        fillers: prev.fillers + umCount,
        clarity: Math.max(70, 98 - (umCount * 4)),
        structure: responseText.length > 80 ? "STAR - Action" : "STAR - Situation"
      }));

      // 3. Trigger next question after "thinking" delay
      setTimeout(() => {
        setAssistantState("speaking");
        const nextQuestion = selectedPersona.questions[currentQuestionIndex];
        
        if (nextQuestion) {
          setMessages(prev => [...prev, {
            sender: "assistant",
            text: nextQuestion,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }]);
          setCurrentQuestionIndex(prev => prev + 1);
        } else {
          setMessages(prev => [...prev, {
            sender: "assistant",
            text: "That was the last of my questions. You did exceptionally well navigating these scenarios! I've logged your metrics. Feel free to review them or reset the session.",
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }]);
          setAssistantState("idle");
        }
      }, 2500);

    }, 1200);
  };

  // Mock speech engine cycle trigger (next question simulation)
  const handleSimulateState = (state: AssistantState) => {
    setAssistantState(state);
    if (state === "speaking") {
      const nextQuestion = selectedPersona.questions[currentQuestionIndex];
      if (nextQuestion) {
        setMessages(prev => [...prev, {
          sender: "assistant",
          text: nextQuestion,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
        setCurrentQuestionIndex(prev => prev + 1);
      } else {
        setMessages(prev => [...prev, {
          sender: "assistant",
          text: "Let me summarize. Your approach highlights excellent distribution architecture. Would you like to restart the session or look at the performance logs?",
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }]);
        setAssistantState("idle");
      }
    }
  };

  // Reset current session
  const handleResetSession = () => {
    setMessages([
      {
        sender: "assistant",
        text: selectedPersona.initialPrompt,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      }
    ]);
    setAssistantState("speaking");
    setCurrentQuestionIndex(0);
    setTimer(0);
    setMetrics({
      pacing: 0,
      fillers: 0,
      clarity: 98,
      structure: "STAR - Hook"
    });
  };

  // Helper to generate dynamic height/scale for equalizer bars
  const getEqualizerStyle = (index: number) => {
    if (!micOn) return { height: "4px" };
    // Mix active stream level with offset for variance
    const multiplier = 0.4 + (index * 0.15);
    const heightVal = Math.max(4, Math.floor(audioLevel * multiplier));
    return {
      height: `${Math.min(32, heightVal)}px`,
      transition: "height 0.08s ease"
    };
  };

  // Decide Orb visual classes based on state
  const getOrbStateConfig = () => {
    switch (assistantState) {
      case "listening":
        return {
          gradient: "from-[#0D9488] via-[#06B6D4] to-[#3B82F6]", // Teal / Cyan / Blue
          scale: "scale-105",
          ringColor: "border-[#06B6D4]/30",
          shadowColor: "shadow-[0_0_50px_20px_rgba(6,182,212,0.35)]",
          label: "LISTENING"
        };
      case "thinking":
        return {
          gradient: "from-[#6366F1] via-[#8B5CF6] to-[#EC4899]", // Indigo / Purple / Pink
          scale: "scale-100 rotate-180",
          ringColor: "border-[#8B5CF6]/30",
          shadowColor: "shadow-[0_0_50px_20px_rgba(139,92,246,0.35)]",
          label: "THINKING"
        };
      case "speaking":
        return {
          gradient: `from-[#C17F3B] via-[#D18F4B] to-[#EF4444]`, // Amber / Gold / Coral
          scale: "scale-110",
          ringColor: "border-[#C17F3B]/30",
          shadowColor: "shadow-[0_0_60px_25px_rgba(193,127,59,0.35)]",
          label: "SPEAKING"
        };
      case "idle":
      default:
        return {
          gradient: "from-[#4B5563] via-[#374151] to-[#1F2937]", // Slate / Dark Gray
          scale: "scale-95",
          ringColor: "border-white/5",
          shadowColor: "shadow-[0_0_30px_10px_rgba(255,255,255,0.05)]",
          label: "STANDBY"
        };
    }
  };

  const orbConfig = getOrbStateConfig();

  return (
    <div className="flex flex-col h-screen max-h-screen bg-[#0B0C0E] text-[#F5F0E8] overflow-y-auto overflow-x-hidden no-scrollbar relative font-sans">
      <style dangerouslySetInnerHTML={{ __html: customStyles }} />

      {/* Subtle background glow */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-[#C17F3B]/5 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-[#8B5CF6]/5 blur-[120px] pointer-events-none" />

      {/* Top Header */}
      <header className="flex justify-between items-center px-6 py-4 border-b border-[#1E2024] bg-[#0E1013]/80 backdrop-blur-md sticky top-0 z-40">
        <div className="flex items-center gap-3.5">
          <button 
            onClick={onExit}
            className="flex items-center justify-center p-2 rounded-lg bg-[#16181C] hover:bg-[#202329] border border-[#2A2D33]/60 transition-colors text-[#8A8F98] hover:text-[#F5F0E8] cursor-pointer"
          >
            <ArrowLeft className="size-4" />
          </button>
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-[0.2em] text-[#8A8F98] font-semibold">Mockview</span>
            <span className="text-sm font-medium text-[#F5F0E8]">AI Interview Simulator</span>
          </div>
        </div>

        {/* Live Timer & Connection Status */}
        <div className="flex items-center gap-6">
          <div className="hidden sm:flex items-center gap-2 bg-[#16181C] border border-[#2A2D33]/40 rounded-full py-1.5 px-3">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[11px] font-semibold text-emerald-500 uppercase tracking-wider">LIVE</span>
            <div className="w-[1px] h-3 bg-[#2A2D33] mx-1" />
            <Clock className="size-3.5 text-[#8A8F98]" />
            <span className="text-xs font-mono text-[#F5F0E8]">{formatTime(timer)}</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-[#8A8F98]">
            <Wifi className="size-3.5 text-emerald-500 animate-pulse" />
            <span>124ms Latency</span>
          </div>

          <Button 
            variant="destructive"
            size="sm"
            onClick={onExit}
            className="rounded-lg h-9 px-4 font-medium transition-transform active:scale-95 cursor-pointer"
          >
            End Interview
          </Button>
        </div>
      </header>

      {/* Main Grid Content */}
      <main className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 p-6 max-w-7xl mx-auto w-full">
        
        {/* LEFT COLUMN: Camera & Audio Visualizer (7 cols on desktop) */}
        <section className="lg:col-span-7 flex flex-col gap-5">
          <Card className="bg-[#121418]/80 backdrop-blur-xl border-[#1E2024] shadow-2xl overflow-hidden relative aspect-video w-full flex flex-col justify-between py-0">
            {/* Top Stats HUD Overlay */}
            <div className="absolute top-4 left-4 right-4 flex justify-between items-start z-10 pointer-events-none">
              <div className="flex items-center gap-2 bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/5">
                <div className="size-2 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-[10px] font-semibold tracking-wider uppercase text-rose-400">REC CAM</span>
              </div>

              {/* Dynamic Sound Equalizer HUD */}
              <div className="flex items-end gap-[3px] bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/5 h-8">
                <span className="text-[9px] text-[#8A8F98] mr-1.5 uppercase font-medium self-center">Mic Level</span>
                {[...Array(6)].map((_, i) => (
                  <div 
                    key={i} 
                    style={getEqualizerStyle(i)}
                    className="w-1.5 bg-gradient-to-t from-emerald-500 to-teal-400 rounded-full"
                  />
                ))}
              </div>
            </div>

            {/* Video Feed Area */}
            <div className="flex-1 w-full h-full relative bg-[#090A0C] flex items-center justify-center">
              {cameraOn && cameraPermission === "granted" ? (
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover scale-x-[-1]" 
                />
              ) : (
                /* Sleek Dark Fallback Avatar */
                <div className="flex flex-col items-center justify-center text-center p-6 w-full h-full">
                  <div className="relative mb-4">
                    <div className="absolute inset-0 bg-[#C17F3B]/10 rounded-full blur-xl animate-pulse" />
                    <div className="relative size-24 rounded-full bg-[#1A1C20] border-2 border-[#2A2D33] flex items-center justify-center text-[#C17F3B] shadow-inner">
                      <CameraOff className="size-8 text-[#8A8F98]" />
                    </div>
                  </div>
                  <h3 className="text-sm font-medium text-[#F5F0E8]">
                    {cameraOn ? "Requesting Camera Access..." : "Camera Switched Off"}
                  </h3>
                  <p className="text-xs text-[#8A8F98] max-w-[240px] mt-1 leading-relaxed">
                    {cameraOn 
                      ? "Please grant webcam permissions in your browser to view your video feed."
                      : "Turn on your camera below to see yourself during the interview."}
                  </p>
                </div>
              )}

              {/* Glowing bottom overlay on live video */}
              {cameraOn && cameraPermission === "granted" && (
                <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
              )}
            </div>

            {/* Float HUD Controls */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/50 backdrop-blur-md border border-white/10 rounded-full px-5 py-2.5 z-10 shadow-lg">
              <button
                type="button"
                onClick={() => setMicOn(!micOn)}
                className={`flex items-center justify-center size-10 rounded-full transition-colors cursor-pointer ${
                  micOn 
                    ? "bg-white/10 hover:bg-white/20 text-[#F5F0E8]" 
                    : "bg-red-500/80 hover:bg-red-600/90 text-white"
                }`}
                title={micOn ? "Mute Microphone" : "Unmute Microphone"}
              >
                {micOn ? <Mic className="size-4" /> : <MicOff className="size-4" />}
              </button>

              <button
                type="button"
                onClick={() => setCameraOn(!cameraOn)}
                className={`flex items-center justify-center size-10 rounded-full transition-colors cursor-pointer ${
                  cameraOn 
                    ? "bg-white/10 hover:bg-white/20 text-[#F5F0E8]" 
                    : "bg-red-500/80 hover:bg-red-600/90 text-white"
                }`}
                title={cameraOn ? "Turn Camera Off" : "Turn Camera On"}
              >
                {cameraOn ? <Camera className="size-4" /> : <CameraOff className="size-4" />}
              </button>

              <button
                type="button"
                className="flex items-center justify-center size-10 rounded-full bg-white/10 hover:bg-white/20 text-[#F5F0E8] transition-colors cursor-pointer"
                title="Share Screen (Mock)"
              >
                <Monitor className="size-4" />
              </button>

              <div className="w-[1px] h-5 bg-white/15 mx-1" />

              <button
                type="button"
                className="flex items-center justify-center size-10 rounded-full bg-white/10 hover:bg-white/20 text-[#F5F0E8] transition-colors cursor-pointer"
                title="Camera & Microphone Settings"
              >
                <Sliders className="size-4" />
              </button>
            </div>
          </Card>

          {/* REAL-TIME FEEDBACK HUD */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="bg-[#121418]/60 border-[#1E2024] py-3.5 px-4 shadow-sm flex flex-col justify-between">
              <span className="text-[10px] uppercase tracking-wider text-[#8A8F98] font-semibold">Pacing Speed</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-bold text-[#F5F0E8]">{metrics.pacing || "--"}</span>
                <span className="text-[10px] text-[#8A8F98]">WPM</span>
              </div>
              <span className="text-[9px] text-emerald-500 font-medium mt-0.5">● Optimal Range</span>
            </Card>

            <Card className="bg-[#121418]/60 border-[#1E2024] py-3.5 px-4 shadow-sm flex flex-col justify-between">
              <span className="text-[10px] uppercase tracking-wider text-[#8A8F98] font-semibold">Filler Words</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-bold text-[#F5F0E8]">{metrics.fillers}</span>
                <span className="text-[10px] text-[#8A8F98]">counts</span>
              </div>
              <span className="text-[9px] text-[#8A8F98] font-medium mt-0.5">Um, basic, like</span>
            </Card>

            <Card className="bg-[#121418]/60 border-[#1E2024] py-3.5 px-4 shadow-sm flex flex-col justify-between">
              <span className="text-[10px] uppercase tracking-wider text-[#8A8F98] font-semibold">Clarity Score</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-xl font-bold text-[#F5F0E8]">{metrics.clarity}%</span>
              </div>
              <span className="text-[9px] text-emerald-500 font-medium mt-0.5">● High Pronunciation</span>
            </Card>

            <Card className="bg-[#121418]/60 border-[#1E2024] py-3.5 px-4 shadow-sm flex flex-col justify-between">
              <span className="text-[10px] uppercase tracking-wider text-[#8A8F98] font-semibold">Structure Map</span>
              <div className="flex items-baseline gap-1 mt-1">
                <span className="text-sm font-bold text-[#C17F3B] truncate max-w-full">{metrics.structure}</span>
              </div>
              <span className="text-[9px] text-[#8A8F98] font-medium mt-0.5">STAR Framework</span>
            </Card>
          </div>

          {/* AI PERSONA CARD DESCRIPTION */}
          <Card className="bg-[#121418]/40 border-[#1E2024] p-4 flex gap-4 items-start shadow-sm">
            <div className={`p-2.5 rounded-xl bg-gradient-to-tr ${selectedPersona.color} text-black shrink-0 shadow-md`}>
              <Sparkles className="size-5" />
            </div>
            <div className="flex-1">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-[#8A8F98]">Active Persona Profile</h4>
              <p className="text-sm font-semibold text-[#F5F0E8] mt-0.5">{selectedPersona.name} ({selectedPersona.role})</p>
              <p className="text-xs text-[#8A8F98] mt-1 leading-relaxed">{selectedPersona.description}</p>
            </div>
          </Card>
        </section>

        {/* RIGHT COLUMN: Voice Assistant UI & Transcripts (5 cols on desktop) */}
        <section className="lg:col-span-5 flex flex-col gap-5 h-full">
          <Card className="bg-[#121418]/80 backdrop-blur-xl border-[#1E2024] shadow-2xl flex flex-col justify-between overflow-hidden h-[540px] py-5">
            
            {/* Header: Select Persona */}
            <div className="border-b border-[#1E2024] pb-4 px-6 flex justify-between items-center">
              <div className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-wider text-[#8A8F98] font-semibold">Voice Interviewer</span>
                <Select
                  value={selectedPersona.id}
                  onValueChange={(val) => {
                    const found = PERSONAS.find(p => p.id === val);
                    if (found) setSelectedPersona(found);
                  }}
                >
                  <SelectTrigger className="w-[190px] border-[#2A2D33] text-sm bg-transparent hover:bg-[#16181C] text-[#F5F0E8] cursor-pointer">
                    <SelectValue placeholder="Select Interviewer" />
                  </SelectTrigger>
                  <SelectContent className="bg-[#16181C] border-[#2A2D33] text-[#F5F0E8]">
                    {PERSONAS.map(p => (
                      <SelectItem key={p.id} value={p.id} className="cursor-pointer hover:bg-[#202329] focus:bg-[#202329]">
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Status indicator */}
              <div className="flex flex-col items-end gap-1">
                <span className="text-[9px] uppercase tracking-widest text-[#8A8F98] font-bold">AI Status</span>
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded-full border ${
                  assistantState === "listening" ? "text-cyan-400 bg-cyan-950/20 border-cyan-800/30 animate-pulse" :
                  assistantState === "thinking" ? "text-indigo-400 bg-indigo-950/20 border-indigo-800/30" :
                  assistantState === "speaking" ? "text-amber-400 bg-amber-950/20 border-amber-800/30" :
                  "text-[#8A8F98] bg-[#16181C] border-[#2A2D33]/30"
                }`}>
                  <span className={`size-1.5 rounded-full ${
                    assistantState === "listening" ? "bg-cyan-400 animate-ping" :
                    assistantState === "thinking" ? "bg-indigo-400 animate-spin" :
                    assistantState === "speaking" ? "bg-amber-400" :
                    "bg-[#8A8F98]"
                  }`} />
                  {orbConfig.label}
                </span>
              </div>
            </div>

            {/* Orb Visualizer Display */}
            <div className="flex-1 flex flex-col justify-center items-center py-6 relative">
              {/* Outer Pulsing Background Circles */}
              <div className="absolute size-56 rounded-full bg-transparent flex items-center justify-center pointer-events-none">
                {assistantState !== "idle" && (
                  <>
                    <div className={`absolute inset-0 rounded-full border-2 ${orbConfig.ringColor} ripple-effect`} />
                    <div className={`absolute inset-0 rounded-full border-2 ${orbConfig.ringColor} ripple-effect`} style={{ animationDelay: "1.2s" }} />
                  </>
                )}
              </div>

              {/* Glow backdrop */}
              <div className={`absolute size-44 rounded-full bg-gradient-to-tr ${orbConfig.gradient} blur-3xl opacity-35 transition-all duration-700 ${orbConfig.shadowColor} ${orbConfig.scale}`} />

              {/* The Interactive Orb */}
              <div className={`relative size-28 bg-gradient-to-tr ${orbConfig.gradient} shadow-2xl transition-all duration-700 morphing-orb ${orbConfig.scale} flex items-center justify-center`}>
                {/* Inner transparent filter */}
                <div className="absolute inset-1.5 rounded-full bg-black/10 backdrop-blur-[1px] border border-white/10" />
                
                {/* Micro animations of voice frequencies inside the speaking state */}
                {assistantState === "speaking" && (
                  <div className="flex items-center gap-1 relative z-10">
                    <span className="w-1 h-6 bg-white rounded-full animate-pulse" />
                    <span className="w-1 h-10 bg-white rounded-full animate-pulse" style={{ animationDelay: "0.2s" }} />
                    <span className="w-1 h-5 bg-white rounded-full animate-pulse" style={{ animationDelay: "0.4s" }} />
                  </div>
                )}
                {assistantState === "listening" && (
                  <div className="relative z-10">
                    <span className="flex size-4 items-center justify-center">
                      <span className="absolute inline-flex h-full w-full rounded-full bg-white opacity-40 animate-ping" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                    </span>
                  </div>
                )}
              </div>

              {/* Help tip text below the orb */}
              <span className="text-[10px] text-[#8A8F98] mt-6 tracking-wide max-w-[200px] text-center">
                {assistantState === "idle" && "Click simulator below to start conversation"}
                {assistantState === "listening" && "Listening to your response... Speak now"}
                {assistantState === "thinking" && `${selectedPersona.name} is evaluating...`}
                {assistantState === "speaking" && `${selectedPersona.name} is asking a question`}
              </span>
            </div>

            {/* Transcript log list */}
            <div className="h-[140px] px-6 overflow-hidden overflow-y-auto no-scrollbar space-y-3.5 border-t border-b border-[#1E2024] py-4 bg-[#0E1013]/30">
              {messages.map((msg, index) => (
                <div 
                  key={index} 
                  className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[9px] uppercase tracking-wider text-[#8A8F98] font-bold">
                      {msg.sender === "user" ? "Candidate" : selectedPersona.name}
                    </span>
                    <span className="text-[8px] text-[#5A5F68]">{msg.timestamp}</span>
                  </div>
                  <div className={`text-xs px-3.5 py-2 rounded-2xl max-w-[85%] leading-relaxed break-words overflow-hidden ${
                    msg.sender === "user" 
                      ? "bg-[#C17F3B]/10 border border-[#C17F3B]/20 text-[#F5F0E8] rounded-tr-none" 
                      : "bg-[#16181C] border border-[#2A2D33]/60 text-[#F5F0E8] rounded-tl-none shadow-[0_1px_2px_rgba(0,0,0,0.2)]"
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
                className="flex-1 bg-[#16181C] border border-[#2A2D33] rounded-lg text-xs py-2.5 px-3.5 text-[#F5F0E8] placeholder-[#5A5F68] focus:outline-none focus:border-[#C17F3B]/60 focus:ring-1 focus:ring-[#C17F3B]/40 disabled:opacity-50 transition-colors"
              />
              <button
                type="submit"
                disabled={!textInput.trim() || assistantState === "thinking"}
                className="flex items-center justify-center p-2.5 rounded-lg bg-[#C17F3B] hover:bg-[#D18F4B] active:bg-[#B0722F] text-[#0B0C0E] transition-colors disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
              >
                <Send className="size-3.5" />
              </button>
            </form>

          </Card>

          {/* SIMULATOR ACTION CONTROL PANEL */}
          <Card className="bg-[#121418]/60 border-[#1E2024] p-4 flex flex-col gap-3.5 shadow-sm">
            <div className="flex items-center justify-between border-b border-[#2A2D33]/40 pb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#8A8F98] flex items-center gap-1.5">
                <Activity className="size-3.5 text-[#C17F3B]" />
                Prototype Controller & State Simulator
              </span>
              <button 
                type="button"
                onClick={handleResetSession}
                className="text-[9px] uppercase tracking-wider font-semibold text-[#8A8F98] hover:text-[#F5F0E8] flex items-center gap-1 cursor-pointer transition-colors"
                title="Reset Session"
              >
                <RotateCcw className="size-2.5" /> Reset
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-[11px] h-8 justify-start gap-1.5 text-[#8A8F98] hover:text-[#F5F0E8] hover:bg-[#1C1F24] cursor-pointer"
                onClick={() => handleSimulateState("idle")}
              >
                <div className="size-2 rounded-full bg-slate-500" />
                Trigger Standby
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                className="text-[11px] h-8 justify-start gap-1.5 text-[#8A8F98] hover:text-[#F5F0E8] hover:bg-[#1C1F24] cursor-pointer"
                onClick={() => handleSimulateState("listening")}
              >
                <div className="size-2 rounded-full bg-cyan-400" />
                Trigger Listening
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="text-[11px] h-8 justify-start gap-1.5 text-[#8A8F98] hover:text-[#F5F0E8] hover:bg-[#1C1F24] cursor-pointer"
                onClick={() => handleSimulateState("thinking")}
              >
                <div className="size-2 rounded-full bg-indigo-500" />
                Trigger Thinking
              </Button>

              <Button
                variant="outline"
                size="sm"
                className="text-[11px] h-8 justify-start gap-1.5 text-[#8A8F98] hover:text-[#F5F0E8] hover:bg-[#1C1F24] cursor-pointer"
                onClick={() => handleSimulateState("speaking")}
              >
                <div className="size-2 rounded-full bg-amber-500" />
                AI Ask Next Question
              </Button>
            </div>
            <p className="text-[10px] text-[#8A8F98]/80 text-center italic mt-0.5">
              Type in the input and click Send to simulate a conversational response cycle!
            </p>
          </Card>
        </section>

      </main>
    </div>
  );
}

export default InterviewPage;
