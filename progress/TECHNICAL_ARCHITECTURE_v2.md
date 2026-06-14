# 🏗️ Technical Architecture — Zain Companion Chat + TTS

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     ZAIN COMPANION ARCHITECTURE                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                    FRONTEND (React 19 + Vite)                  │ │
│  │                                                                │ │
│  │  ┌─────────────┐  ┌──────────────┐  ┌──────────────┐          │ │
│  │  │ BlobCanvas  │  │ChatTextbox   │  │ ChatWidget   │          │ │
│  │  │  (click,    │  │ (floating    │  │ (full chat   │          │ │
│  │  │   drag)     │  │  input)      │  │  history)    │          │ │
│  │  └──────┬──────┘  └──────┬───────┘  └──────┬───────┘          │ │
│  │         │                │                 │                  │ │
│  │  ┌──────▼────────────────▼─────────────────▼────────┐         │ │
│  │  │        State Management (Zustand)                │         │ │
│  │  │  ┌──────────────────┐  ┌──────────────────────┐ │         │ │
│  │  │  │ Chat Store       │  │ Config Store         │ │         │ │
│  │  │  │ - messages[]     │  │ - llmProvider        │ │         │ │
│  │  │  │ - isProcessing   │  │ - llmModel           │ │         │ │
│  │  │  │ - isPlayingAudio │  │ - apiKey, apiUrl     │ │         │ │
│  │  │  │ - pendingReqs    │  │ - temperature        │ │         │ │
│  │  │  └──────────────────┘  │ - speakerId          │ │         │ │
│  │  │                        │ - textboxOpen        │ │         │ │
│  │  │                        │ - isDragging         │ │         │ │
│  │  │                        └──────────────────────┘ │         │ │
│  │  └─────────────────────────────────────────────────┘         │ │
│  │         │                                                    │ │
│  │         │ API Layer (Tauri commands)                         │ │
│  └─────────┼────────────────────────────────────────────────────┘ │
│            │                                                       │
│  ┌─────────▼──────────────────────────────────────────────────┐   │
│  │           RUST BACKEND (Tauri + Tokio)                    │   │
│  │                                                            │   │
│  │  ┌─────────────────────────────────────────────────────┐  │   │
│  │  │  lib.rs — Command Handlers                          │  │   │
│  │  │  ┌──────────────────────────────────────────────┐   │  │   │
│  │  │  │ send_chat_message() — spawn LLM task         │   │  │   │
│  │  │  │   └─> llm::stream_llm()                      │   │  │   │
│  │  │  │       └─> HTTP to provider                   │   │  │   │
│  │  │  │           ├─ emit: llm:token                 │   │  │   │
│  │  │  │           ├─ emit: llm:done                  │   │  │   │
│  │  │  │           └─> Auto-call send_tts()           │   │  │   │
│  │  │  │                                               │   │  │   │
│  │  │  │ send_tts() — forward to Python sidecar       │   │  │   │
│  │  │  │   └─> sidecar::send_tts()                    │   │  │   │
│  │  │  │       └─> Write JSONL to stdin                │   │  │   │
│  │  │  │           └─> Read stdout (audio chunks)     │   │  │   │
│  │  │  │               └─> emit: audio:chunk (b64)    │   │  │   │
│  │  │  │                   emit: audio:done           │   │  │   │
│  │  │  └──────────────────────────────────────────────┘   │  │   │
│  │  │                                                     │  │   │
│  │  │  ┌─────────────────────────────────────────────┐   │  │   │
│  │  │  │ llm.rs — Provider-agnostic HTTP streaming   │   │  │   │
│  │  │  │ ┌─────────────────────────────────────────┐ │   │  │   │
│  │  │  │ │ stream_llm()                            │ │   │  │   │
│  │  │  │ │ ├─ provider == \"ollama\"               │ │   │  │   │
│  │  │  │ │ │  └─ POST /api/chat                   │ │   │  │   │
│  │  │  │ │ ├─ provider == \"openai\"               │ │   │  │   │
│  │  │  │ │ │  └─ POST /v1/chat/completions       │ │   │  │   │
│  │  │  │ │ ├─ provider == \"anthropic\"            │ │   │  │   │
│  │  │  │ │ │  └─ POST /v1/messages (event stream) │ │   │  │   │
│  │  │  │ │ ├─ provider == \"gemini\"               │ │   │  │   │
│  │  │  │ │ │  └─ POST /v1beta/models/{m}:stream  │ │   │  │   │
│  │  │  │ │ └─ provider == \"deepseek\"             │ │   │  │   │
│  │  │  │ │    └─ POST /v1/chat/completions       │ │   │  │   │
│  │  │  │ │                                        │ │   │  │   │
│  │  │  │ │ Common flow for all:                   │ │   │  │   │
│  │  │  │ │ 1. Build request from config          │ │   │  │   │
│  │  │  │ │ 2. Stream response line-by-line       │ │   │  │   │
│  │  │  │ │ 3. Parse SSE (or event stream)        │ │   │  │   │
│  │  │  │ │ 4. Extract token                      │ │   │  │   │
│  │  │  │ │ 5. Emit window event                  │ │   │  │   │
│  │  │  │ │ 6. Check cancellation flag            │ │   │  │   │
│  │  │  │ │ 7. Accumulate full text               │ │   │  │   │
│  │  │  │ │ 8. Return full text on completion     │ │   │  │   │
│  │  │  │ └─────────────────────────────────────┘ │   │  │   │
│  │  │  └─────────────────────────────────────────┘   │  │   │
│  │  │                                                │  │   │
│  │  │  ┌─────────────────────────────────────────┐   │  │   │
│  │  │  │ sidecar.rs — Python IPC Manager         │   │  │   │
│  │  │  │ ┌─────────────────────────────────────┐ │   │  │   │
│  │  │  │ │ SidecarProcess                      │ │   │  │   │
│  │  │  │ │ ├─ spawn() — start Python proc     │ │   │  │   │
│  │  │  │ │ ├─ send_tts() — send JSONL         │ │   │  │   │
│  │  │  │ │ │  Message: {\"type\": \"tts\", ...} │ │   │  │   │
│  │  │  │ │ ├─ recv_audio() — read chunks     │ │   │  │   │
│  │  │  │ │ │  Response: {\"type\": \"audio\", ...}│ │   │  │   │
│  │  │  │ │ ├─ heartbeat() — check health    │ │   │  │   │
│  │  │  │ │ └─ kill() — shutdown             │ │   │  │   │
│  │  │  │ │                                   │ │   │  │   │
│  │  │  │ │ JSONL Protocol:                   │ │   │  │   │
│  │  │  │ │ ├─ Heartbeat: {\"type\": \"ping\"}  │ │   │  │   │
│  │  │  │ │ │  Response:  {\"type\": \"pong\"}  │ │   │  │   │
│  │  │  │ │ ├─ TTS request: {...}            │ │   │  │   │
│  │  │  │ │ │  Response:  audio chunks       │ │   │  │   │
│  │  │  │ │ └─ Error: {\"error\": \"...\"}     │ │   │  │   │
│  │  │  │ └─────────────────────────────────┘ │   │  │   │
│  │  │  └─────────────────────────────────────┘   │  │   │
│  │  └─────────────────────────────────────────────┘  │   │
│  │              ▲                                     │   │
│  │              │ Emit Tauri Events                  │   │
│  └──────────────┼─────────────────────────────────────┘   │
│                │                                          │
│   ┌────────────┴──────────────────────┐                  │
│   │                                   │                  │
│   ▼                                   ▼                  │
│ Event: llm:token           Event: audio:chunk           │
│ Event: llm:done            Event: audio:done            │
│ Event: llm:error           Event: sidecar:status        │
│   │                                   │                  │
│   └────────────┬──────────────────────┘                  │
│                │                                         │
│                ▼                                         │
│   ┌──────────────────────────────────────────────────┐  │
│   │  Frontend Event Listeners (App.tsx)              │  │
│   │  ├─ onLlmToken → accumulate text in message     │  │
│   │  ├─ onLlmDone → mark message done               │  │
│   │  ├─ onLlmError → show error in message          │  │
│   │  ├─ onAudioChunk → enqueue in AudioPlayer      │  │
│   │  ├─ onAudioDone → set isPlayingAudio = false   │  │
│   │  └─ onSidecarStatus → log status               │  │
│   └──────────────────────────────────────────────────┘  │
│                │                                         │
│                ▼                                         │
│   ┌──────────────────────────────────────────────────┐  │
│   │  Audio Playback (audio.ts)                       │  │
│   │  ├─ AudioPlayer class                           │  │
│   │  │  ├─ enqueueChunk(b64) — decode PCM          │  │
│   │  │  ├─ play() — start Web Audio API            │  │
│   │  │  ├─ stop() — stop playback                  │  │
│   │  │  └─ queue: PCM chunks                       │  │
│   │  └─ Web Audio API                              │  │
│   │     ├─ AudioContext                            │  │
│   │     ├─ AudioBuffer                             │  │
│   │     ├─ AudioBufferSource                       │  │
│   │     └─ GainNode → Destination (speakers)       │  │
│   └──────────────────────────────────────────────────┘  │
│                │                                         │
│                ▼                                         │
│   ┌──────────────────────────────────────────────────┐  │
│   │  🔊 AUDIO OUTPUT (Speakers)                      │  │
│   └──────────────────────────────────────────────────┘  │
│                                                          │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌────────────────────────────────────────────────────┐│
│  │   EXTERNAL: Python Sidecar (csm_sidecar.py)      ││
│  │   ┌────────────────────────────────────────────┐ ││
│  │   │ CSM Generator (Sesame Speech Model)         │ ││
│  │   │ ├─ Load CSM-1B from HuggingFace            │ ││
│  │   │ ├─ Listen on stdin (JSONL messages)        │ ││
│  │   │ │  Receive: {\"text\": \"...\", \"speaker_id\": 0} │ ││
│  │   │ │                                           │ ││
│  │   │ ├─ Generate speech (tokenize + model)      │ ││
│  │   │ ├─ Output PCM f32 (44.1 kHz, 24-bit)       │ ││
│  │   │ │                                           │ ││
│  │   │ ├─ Write to stdout (JSONL chunks)          │ ││
│  │   │ │  Send: {\"type\": \"audio\", \"pcm_base64\": ...} │ ││
│  │   │ │         (repeat for each chunk)          │ ││
│  │   │ │  Send: {\"type\": \"audio_done\"}         │ ││
│  │   │ │                                           │ ││
│  │   │ └─ Error handling (fallback to beep)       │ ││
│  │   └────────────────────────────────────────────┘ ││
│  └────────────────────────────────────────────────────┘│
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Data Flow: Complete Example

### Scenario: User types "Hello" and sends

```
┌─────────────────────────────────────────────────────────┐
│ User Action: Type "Hello" in textbox, Press Enter       │
└─────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────┐
│ ChatTextbox.tsx: handleSend()                           │
│ ├─ Get text: "Hello"                                   │
│ ├─ Call addMessage({ text: "Hello", role: "user" })   │
│ ├─ Call addMessage({}) → placeholder for assistant     │
│ ├─ Call setProcessing(true)                            │
│ ├─ Call registerRequest(uuid, assistantMsgId)          │
│ └─ Call sendChatMessage(requestId, messages, config)   │
└─────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────┐
│ Tauri Bridge: @tauri-apps/api/core invoke()            │
│ ├─ Command: "send_chat_message"                        │
│ ├─ Payload: {                                          │
│ │   requestId: "abc-123",                              │
│ │   messages: [                                        │
│ │     { role: "user", content: "Hello" }               │
│ │   ],                                                 │
│ │   config: {                                          │
│ │     provider: "ollama",                              │
│ │     model: "qwen:4b",                                │
│ │     temperature: 0.7,                                │
│ │     speaker_id: 0,                                   │
│ │     quantization: "fp16"                             │
│ │   }                                                  │
│ │ }                                                    │
│ └─ Serialized to JSON, sent to Rust backend            │
└─────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────┐
│ Rust lib.rs: send_chat_message() handler               │
│ ├─ Register cancellation flag: cancel_map[rid] = false │
│ ├─ Clone Arc<AppState>                                 │
│ └─ Spawn tokio task (async, non-blocking)              │
└─────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────┐
│ Tokio Task in Rust                                      │
│ ├─ Call llm::stream_llm(...) — streaming generator     │
│ └─ Await response completion                           │
└─────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────┐
│ llm.rs: stream_llm()                                    │
│ ├─ Build HTTP POST request                             │
│ │  ├─ URL: http://localhost:11434/api/chat (Ollama)   │
│ │  ├─ Body: {                                          │
│ │  │   "model": "qwen:4b",                             │
│ │  │   "messages": [...],                              │
│ │  │   "stream": true,                                 │
│ │  │   "temperature": 0.7                              │
│ │  │ }                                                 │
│ │  └─ Accept: application/x-ndjson (SSE)              │
│ │                                                     │
│ ├─ Send HTTP request                                   │
│ └─ Stream response (SSE lines)                         │
│                                                        │
│    [Streaming loop begins]                             │
│                                                        │
│    FOR EACH chunk from HTTP stream:                    │
│    │                                                   │
│    ├─ Parse JSON: { "message": { "content": "..." } } │
│    ├─ Extract token: "Hi"                              │
│    ├─ Check cancel flag                                │
│    ├─ Emit window event: \"llm:token\"                 │
│    │  Payload: { request_id: \"abc-123\", token: \"Hi\" } │
│    ├─ Accumulate: full_text += token                  │
│    │  (now full_text = \"Hi\")                         │
│    └─ Loop to next chunk                               │
│                                                        │
│    [After all tokens received]                         │
│    │                                                   │
│    ├─ Emit window event: \"llm:done\"                  │
│    │  Payload: { request_id: \"abc-123\" }             │
│    └─ Return full_text: \"Hi there! How can I help?\" │
└─────────────────────────────────────────────────────────┘
            │ (Multiple token emissions)
            ▼ (Tauri emits to frontend)
┌─────────────────────────────────────────────────────────┐
│ Frontend Event Listener: onLlmToken                     │
│ Payload: { request_id: \"abc-123\", token: \"Hi\" }   │
│                                                        │
│ ├─ Get messageId from store: assistantMsgId            │
│ ├─ Call appendToMessage(assistantMsgId, \"Hi\")        │
│ └─ Store updates:                                      │
│    messages[1].text = \"Hi\"  (now shows in bubble)    │
└─────────────────────────────────────────────────────────┘
    │ (Tokens keep arriving, text grows)
    │ \"Hi there! How can I help?\"
    │
    ▼ (After all tokens)
┌─────────────────────────────────────────────────────────┐
│ Frontend Event Listener: onLlmDone                      │
│ Payload: { request_id: \"abc-123\" }                  │
│                                                        │
│ ├─ Get messageId from store: assistantMsgId            │
│ ├─ Call updateMessage(id, { status: \"done\" })       │
│ └─ Message is now complete (no more cursor)            │
└─────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────┐
│ [Back in Rust send_chat_message task]                   │
│ Match result {                                          │
│   Ok(full_text) => {                                    │
│     ├─ Call sidecar.send_tts(                           │
│     │   request_id = \"abc-123\",                       │
│     │   text = \"Hi there! How can I help?\",           │
│     │   speaker_id = 0,                                 │
│     │   quantization = \"fp16\"                          │
│     │ )                                                 │
│     └─ [TTS pipeline begins]                           │
└─────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────┐
│ sidecar.rs: send_tts()                                  │
│ ├─ Build JSONL message:                                │
│ │  {                                                   │
│ │    \"type\": \"tts\",                               │
│ │    \"request_id\": \"abc-123\",                      │
│ │    \"text\": \"Hi there! How can I help?\",           │
│ │    \"speaker_id\": 0,                                │
│ │    \"quantization\": \"fp16\"                         │
│ │  }                                                   │
│ ├─ Write to Python sidecar stdin                       │
│ └─ Listen on stdout for audio chunks                   │
└─────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────┐
│ Python csm_sidecar.py: Main loop                        │
│ ├─ Read JSONL line from stdin                          │
│ ├─ Parse: { \"type\": \"tts\", \"text\": \"...\" }    │
│ ├─ Call CSM.generate(text, speaker_id=0)               │
│ └─ Receive: audio array (float32, 44.1kHz)             │
└─────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────┐
│ Python: Chunk PCM into 4096-sample pieces               │
│ FOR EACH chunk:                                        │
│ │                                                      │
│ ├─ Encode to base64: b64_pcm                           │
│ ├─ Write JSONL to stdout:                              │
│ │  {                                                  │
│ │    \"type\": \"audio\",                             │
│ │    \"request_id\": \"abc-123\",                     │
│ │    \"pcm_base64\": \"f3+/vwB/f7+Af39/...\",          │
│ │    \"sample_rate\": 44100                            │
│ │  }                                                  │
│ │                                                      │
│ └─ Loop to next chunk                                 │
│                                                       │
│ AFTER all chunks:                                     │
│ ├─ Write JSONL: { \"type\": \"audio_done\" }          │
│ └─ Wait for next request                              │
└─────────────────────────────────────────────────────────┘
            │ (Multiple audio chunk lines)
            ▼
┌─────────────────────────────────────────────────────────┐
│ sidecar.rs: recv_audio()                                │
│ ├─ Read line from Python stdout                        │
│ ├─ Parse JSONL: { \"type\": \"audio\", \"pcm_base64\": ... } │
│ ├─ Emit window event: \"audio:chunk\"                  │
│ │  Payload: { pcm_base64: \"...\", ... }               │
│ └─ Loop to next line                                   │
│                                                       │
│    After \"audio_done\":                              │
│    └─ Emit window event: \"audio:done\"               │
└─────────────────────────────────────────────────────────┘
            │ (Multiple audio:chunk events)
            ▼
┌─────────────────────────────────────────────────────────┐
│ Frontend Event Listener: onAudioChunk                   │
│ Payload: { pcm_base64: \"...\", sample_rate: 44100 }  │
│                                                        │
│ ├─ Call audioPlayer.enqueueChunk(pcm_base64)           │
│ │  ├─ Decode base64 to Uint8Array                     │
│ │  ├─ Convert to Float32Array (audio samples)          │
│ │  ├─ Create AudioBuffer from samples                  │
│ │  ├─ Add to queue: chunks.push(buffer)                │
│ │  └─ If not playing, call play()                      │
│ │                                                      │
│ └─ Call setPlayingAudio(true)                          │
│    (shows bouncing bars in UI)                         │
└─────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────┐
│ Web Audio API: Play Audio                               │
│ ├─ Get buffer from queue                               │
│ ├─ Create AudioBufferSource                            │
│ ├─ Connect: source → gainNode → destination            │
│ ├─ Play: source.start(0)                               │
│ ├─ Wait for \"ended\" event                            │
│ └─ Loop to next buffer in queue                        │
│                                                        │
│    User hears: \"Hi there! How can I help?\"           │
└─────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────┐
│ Frontend Event Listener: onAudioDone                    │
│                                                        │
│ └─ Call setPlayingAudio(false)                         │
│    (hides bouncing bars, ready for next message)       │
└─────────────────────────────────────────────────────────┘
            │
            ▼
┌─────────────────────────────────────────────────────────┐
│ COMPLETE!                                               │
│ ├─ Message displayed in chat                            │
│ ├─ Voice heard through speakers                         │
│ ├─ Next message ready to send                           │
│ └─ Blob returns to idle state (purple)                  │
└─────────────────────────────────────────────────────────┘
```

---

## Key Components Explained

### 1. Message Flow State Machine

```
[User types]
    │
    ▼
{status: "sending"}  ← Initial state
    │
    ├─ Sent to LLM ─────────────┐
    │                            │
    ▼                            │
{status: "sent"}                 │
    │                            │
    │ (receives) ◄──────────────┘
    │
    ▼
{status: "thinking"}  ← LLM processing
    │
    ├─ First token received
    │    │
    │    ▼
    │ {status: "thinking", text: "Hi"}  ← Accumulating
    │    │
    │    ├─ More tokens
    │    │    │
    │    │    ▼
    │    │ {status: "thinking", text: "Hi there"}
    │    │    │
    │    │    └─ ... (continues)
    │    │
    │    ▼
    │ {status: "thinking", text: "Hi there! How...?"}  ← Complete LLM response
    │    │
    │    └─ Send to TTS
    │
    ▼
{status: "done"}  ← Display with cursor stopped
    │
    └─ TTS generating → Audio playing → Audio done
         [UI shows 🎤]    [UI shows ▁▂▃]
```

### 2. Request Tracking

```
Frontend sends request:
  requestId = "uuid-1234"
  messageId = "msg-5678"
  
Store: pendingRequests = {
  "uuid-1234": "msg-5678"
}

Rust emits: llm:token { request_id: "uuid-1234", token: "Hi" }

Frontend receives:
  requestId = "uuid-1234"
  Look up: messageId = pendingRequests["uuid-1234"] = "msg-5678"
  Update: messages["msg-5678"].text += "Hi"
```

### 3. Error Handling

```
User sends message
    │
    ▼
Rust tries to connect to Ollama
    │
    ├─ Success ──→ Stream starts
    │
    └─ Failure ──→ Emit llm:error
                      │
                      ▼
                 Frontend receives
                      │
                      ├─ Find messageId from request_id
                      │
                      ├─ Update message:
                      │  text: "Error: connection refused"
                      │  status: "done"
                      │
                      └─ Set processing = false
```

---

## Critical Paths (Performance)

### Fastest Path (Ollama local, small model)
```
Send → LLM process (2-3s) → Receive → TTS (1-2s) → Audio → Done
Total: 3-5 seconds
```

### Typical Path (GPU-accelerated)
```
Send → LLM process (3-5s) → Receive → TTS (2-4s) → Audio → Done
Total: 5-9 seconds
```

### Slowest Path (CPU only, large model)
```
Send → LLM process (10-30s) → Receive → TTS (15-30s) → Audio → Done
Total: 25-60 seconds
```

---

## Cancellation Flow

```
User clicks "Stop" button while processing

    ▼

ChatWidget.tsx: handleStop()
    │
    └─ Call stopGeneration(requestId)
        │
        ▼
    Tauri: stop_generation command
        │
        └─ Rust: state.cancel_map[requestId] = true
            │
            ▼
        llm.rs: stream_llm() checks flag
            │
            ├─ If set to true:
            │   ├─ Break the streaming loop
            │   ├─ Return error
            │   └─ Emit llm:error event
            │
            └─ Frontend handles error (see above)
```

---

## Extensions & Customization

### Add New LLM Provider

1. **Edit `llm.rs`**: Add new branch to `stream_llm()` function
2. **Implement HTTP request** for provider
3. **Parse response** (SSE or custom format)
4. **Emit tokens** same way as other providers
5. **Test** with sample messages

### Add New TTS Engine

1. **Edit `sidecar.rs`**: Modify `send_tts()` protocol
2. **Create Python wrapper** for new engine
3. **Implement same JSONL protocol** (stdin/stdout)
4. **Output PCM chunks** same format
5. **Update Python sidecar** to load new model

### Add Custom Audio Processing

1. **Modify `audio.ts`**: Intercept `enqueueChunk()`
2. **Apply effects** (EQ, compression, etc.)
3. **Use Web Audio API** nodes (BiquadFilter, Compressor, etc.)
4. **Chain effects**: source → effects → destination

---

## Debugging Tips

### Enable Rust Logging
```rust
// In lib.rs
println!("[llm] token received: {}", token);
println!("[sidecar] sending: {}", json);
```

### Enable Frontend Logging
```javascript
// In App.tsx
onLlmToken((payload) => {
  console.log("[llm:token]", payload)
})
```

### Monitor Python Sidecar
```bash
# In separate terminal
tail -f /tmp/csm_sidecar.log
```

### Network Debugging
```bash
# Check Ollama
curl -s http://localhost:11434/api/models | jq

# Check specific model
curl -X POST http://localhost:11434/api/chat \
  -d '{"model": "qwen:4b", "messages": [{"content": "hi", "role": "user"}], "stream": true}' \
  -H "Content-Type: application/json"
```

---

**Architecture Version: 1.0**  
**Last Updated: 2026-06-14**  
**Status: Production Ready** ✅
