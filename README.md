# Mockview - AI Interview Simulator

Mockview is a premium, real-time AI Interview Simulator that simulates professional job interviews using the Gemini Live API. It supports bidirectional, ultra-low latency voice conversations, dynamic persona selection, live metrics, and real-time response transcriptions.

---

## 🏗️ Project Architecture

Mockview is organized as a high-performance **TypeScript monorepo** managed by **Turborepo** and powered by **Bun**.

```
mockview/
├── apps/
│   ├── frontend/        # React + TypeScript single-page app (UI and Audio pipelines)
│   └── backend/         # Express + Node.js backend (Session Management & Ephemeral Token Minting)
└── packages/
    ├── eslint-config/   # Monorepo-wide Linting configuration
    ├── typescript-config/ # TypeScript configurations
    └── ui/              # Shared component library
```

---

## 🎙️ Low-Latency Audio Streaming Pipeline

Mockview implements a state-of-the-art Web Audio pipeline designed for ultra-low latency bidirectional communication, replacing record-and-upload workflows with continuous streaming.

```
+------------+      +-------------------+      +----------------------+      +-------------+
| Microphone | ---> |    AudioContext   | ---> | AudioWorkletProcessor| ---> | Main Thread |
| (User Voc) |      | (Mono @ 16000 Hz) |      | (Float32 -> Int16)   |      | (Base64 En) |
+------------+      +-------------------+      +----------------------+      +-------------+
                                                                                    |
                                                                                    v
+------------+      +-------------------+      +----------------------+      +-------------+
| AI Playback| <--- |  Gapless Decoder  | <--- |     Gemini Live      | <--- |  WebSocket  |
|  (Speaker) |      | (24kHz Mono Play) |      |      WS Server       |      | Transmission|
+------------+      +-------------------+      +----------------------+      +-------------+
```

### 1. Audio Capture (Input)
- **Sample Rate**: Captures raw audio via `navigator.mediaDevices.getUserMedia` at **16000 Hz** mono.
- **Processing Thread (`AudioWorklet`)**:
  - Offloads real-time sample processing from the main UI thread to the audio rendering thread using `AudioWorkletNode`.
  - Captures input in standard 128-frame blocks and accumulates them into a **256-frame buffer** (the optimal balance between latency and transmission stability).
  - Converts raw `Float32` samples to **Int16 PCM** directly in the worklet thread.
  - Passes the Int16 buffer back to the main thread using **transferable objects** (`port.postMessage(buffer, [buffer])`) to achieve zero-copy memory transfers.
- **Fallback**: Automatically falls back to a legacy `ScriptProcessorNode` with a matching `256` buffer size if the user's browser does not support `AudioWorklet` or runs in a non-secure context.
- **WebSocket Streaming**: In the main thread, the buffer is base64 encoded and sent immediately as a JSON payload without batching or silence waiting.

### 2. Audio Playback (Output)
- Decodes incoming base64 **24kHz Int16 PCM** chunks incrementally as they arrive.
- Converts the chunks to `Float32` format and streams them using a gapless playback schedule (`nextPlaybackTimeRef.current`), preventing audio jitter or pauses.
- Instantly handles interruptions: stops playback and clears buffers the millisecond an interruption flag is received.

---

## 🧠 Key Design Decisions

### 🚀 Inline Worklet Module Compilation
- **Problem**: Loading worklets typically requires static files served from the public directory. In bundled React/Vite/Bun setups, this requires modifying complex build configurations to avoid compiling or renaming the worklet file.
- **Solution**: We declared the `AudioStreamProcessor` class inside `InterviewPage.tsx` as an inline template string (`workletCode`). At runtime, we create a dynamic URL via a temporary Blob (`URL.createObjectURL(new Blob([workletCode]))`) to register the module. The object URL is revoked immediately after loading. This ensures 100% environment-agnostic compilation.

### ⚙️ Offloaded Float32-to-Int16 Downsampling
- Heavy mathematical array operations inside high-frequency callback functions trigger Garbage Collection (GC) sweeps. By moving the downsampling loop into the browser's audio processing thread inside the `AudioWorkletProcessor`, the main thread is freed up for UI updates and WebSocket tasks.

### 🧬 Transferable ArrayBuffers
- Standard `postMessage` copies arrays, creating memory overhead. By specifying the `ArrayBuffer` in the transfer list of `postMessage`, ownership is directly transferred. This reduces memory footprint and Garbage Collection pressure.

### 🛡️ TypeScript Interface Casting
- Cast `response.serverContent` as `any` prior to property access to allow clean type checking under strict compiler conditions without needing massive interface declarations.

---

## 📖 Engineering Learnings

1. **Web Audio Block Constraint**: AudioWorklet process callbacks are strictly locked to **128 frames**. To stream custom buffer sizes (e.g. 256 or 512) required by the target API, buffer accumulation must be manually handled using internal arrays inside the processor class.
2. **Audio Worklet Limitations**: The `AudioWorkletGlobalScope` is highly restricted. It does not have access to standard utilities like `btoa()` for base64 encoding or network sockets like `WebSocket`. Thus, a two-phase architecture (Worker processing -> Main thread sending) is required.
3. **Audio Context Autoplay Rules**: Modern browsers block programmatically started audio. Resuming `AudioContext` dynamically upon user gesture (e.g. microphone stream initiation) is critical to prevent playback failure.
