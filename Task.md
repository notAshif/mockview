# Task: Migrate Existing Gemini Voice Interview Backend from Legacy WebSocket API to WebRTC Live API

You are a Senior Staff Backend Engineer at Google specializing in WebRTC, real-time media streaming, Node.js, TypeScript, and the Gemini Live API.

Your goal is to refactor my existing backend into a production-ready architecture using the latest Gemini Live API over WebRTC.

## Current Project

I already have:

* Express + TypeScript backend
* Prisma + PostgreSQL
* WebSocket server
* Interview sessions
* Persona system (Elena, Marcus, Sarah)
* Interview logs
* React frontend

Currently, the backend manually connects to:

```
wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent
```

using the legacy Gemini Live API.

This implementation is now deprecated and produces model compatibility errors such as:

```
models/gemini-3.1-flash-live is not found
```

I want the entire project migrated to the modern WebRTC-based Gemini Live architecture.

---

# Requirements

## 1. Remove Legacy WebSocket Implementation

Delete all code related to:

* BidiGenerateContent
* manual WebSocket connection to Gemini
* Base64 PCM encoding
* realtimeInput.mediaChunks
* manual audio forwarding
* manual JSON protocol to Gemini

None of this should remain.

---

## 2. Implement Gemini Live using WebRTC

Use Google's latest supported Gemini Live API.

The browser should establish a WebRTC connection directly with Gemini.

The backend should never proxy microphone audio.

The backend is responsible only for:

* authentication
* interview creation
* persona configuration
* transcript persistence
* interview scoring
* analytics
* session lifecycle

---

## 3. Backend Responsibilities

Create endpoints for:

### POST /api/interviews

Creates interview

Returns:

* interviewId
* persona
* WebRTC session information
* ephemeral token / client secret

---

### POST /api/interviews/:id/log

Store transcript events.

Example:

```
{
  "sender":"assistant",
  "text":"Tell me about yourself."
}
```

and

```
{
  "sender":"user",
  "text":"My name is..."
}
```

---

### POST /api/interviews/:id/end

Marks interview completed.

---

### GET /api/interviews/:id

Returns:

* transcript
* metadata
* score
* duration

---

## 4. Persona System

Keep personas separated.

Create:

```
backend/
    gemini/
        personas.ts
```

Example:

```
export const personas = {
    elena: "...",
    marcus: "...",
    sarah: "..."
}
```

Each interview loads the appropriate system prompt.

---

## 5. Project Structure

Refactor into:

```
backend/

src/

    routes/

    websocket/

    gemini/

    interview/

    services/

    repositories/

    middleware/

    utils/

    prisma/

```

No business logic inside server.ts.

---

## 6. Database

Continue using Prisma.

Store:

Interview

InterviewLog

User

Duration

Persona

Status

Score

Feedback

Do NOT store raw PCM audio.

Only transcripts and metadata.

---

## 7. Frontend

Frontend should:

* connect using WebRTC
* stream microphone
* receive assistant audio
* receive transcripts
* display conversation
* handle interruptions
* reconnect gracefully

Do NOT use Base64 audio.

Do NOT decode PCM manually.

Do NOT use AudioContext queues.

Let WebRTC handle audio.

---

## 8. Error Handling

Implement:

* automatic reconnect
* expired session handling
* invalid token handling
* network recovery
* interview timeout
* microphone permission errors

---

## 9. Logging

Use structured logging.

Log:

Interview started

Session created

WebRTC connected

Transcript received

Interview completed

Errors

Latency

---

## 10. Code Quality

Follow:

* SOLID
* Clean Architecture
* Repository Pattern
* Dependency Injection where appropriate
* Async/await
* Strong TypeScript typing
* No duplicated code

---

## 11. Deliverables

Generate:

* Complete backend
* Complete frontend integration
* Prisma schema updates
* Folder structure
* Environment variables
* README
* Setup instructions
* Migration guide from legacy implementation

---

## Important

Do NOT create placeholders.

Do NOT generate pseudo-code.

Provide production-ready code.

Use the latest officially supported Gemini Live WebRTC API and current SDKs.

Avoid deprecated APIs, legacy WebSocket endpoints, or obsolete model names.

The final implementation should be scalable enough to support thousands of concurrent interview sessions.
