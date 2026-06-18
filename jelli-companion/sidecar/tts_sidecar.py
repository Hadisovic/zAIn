#!/usr/bin/env python3
"""
TTS Sidecar — JSONL IPC over stdin/stdout.

Protocol:
  Input (stdin)  — JSONL: {"type":"tts"|"heartbeat", ...}
  Output (stdout) — JSONL: {"type":"pong"|"audio"|"audio_done"|"error", ...}

Audio chunks are 24 kHz mono PCM float32 arrays.
"""

import json
import sys
import os
import math
import traceback
from typing import Optional

SAMPLE_RATE = 24000
CHUNK_DURATION_MS = 200  # 200ms chunks = ~200ms latency
CHUNK_SIZE = int(SAMPLE_RATE * CHUNK_DURATION_MS / 1000)


def generate_audio(text: str, speaker_id: int, request_id: str):
    """Generate PCM audio chunks from text. Yields lists of float32 samples."""
    # Generate a simple test tone as a speech synthesis fallback
    print(f"[sidecar] Generating audio fallback for request {request_id}", file=sys.stderr)
    sys.stderr.flush()
    yield _generate_test_beep(text)


def _generate_test_beep(text: str):
    """Generate a simple test tone for speech feedback."""
    duration_ms = min(1000 + len(text) * 50, 5000)
    num_samples = int(SAMPLE_RATE * duration_ms / 1000)
    samples = []
    for i in range(num_samples):
        t = i / SAMPLE_RATE
        # 440Hz tone with envelope
        envelope = max(0, 1 - (i / num_samples) * 0.5)
        samples.append(math.sin(2 * math.pi * 440 * t) * 0.3 * envelope)
    return samples


# ── IPC Loop ───────────────────────────────────────────────────────────────

def send(obj: dict):
    """Write a JSON line to stdout and flush."""
    line = json.dumps(obj, ensure_ascii=False)
    sys.stdout.write(line + "\n")
    sys.stdout.flush()


def handle_tts(text: str, speaker_id: int, request_id: str, quantization: Optional[str]):
    """Generate TTS audio and stream chunks to stdout as JSONL."""
    try:
        for chunk in generate_audio(text, speaker_id, request_id):
            send({
                "type": "audio",
                "pcm_data": chunk,
                "sample_rate": SAMPLE_RATE,
                "request_id": request_id,
            })
    except Exception as e:
        send({"type": "error", "message": str(e), "request_id": request_id})
        return

    send({"type": "audio_done", "request_id": request_id})


def main():
    # Signal readiness via both stderr (human-readable) and stdout (machine-readable)
    print("[sidecar] Started, waiting for commands...", file=sys.stderr)
    sys.stderr.flush()
    send({"type": "ready", "version": "1.0"})

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            msg = json.loads(line)
        except json.JSONDecodeError as e:
            print(f"[sidecar] Invalid JSON: {e}", file=sys.stderr)
            sys.stderr.flush()
            continue

        msg_type = msg.get("type")

        if msg_type == "heartbeat":
            send({"type": "pong"})

        elif msg_type == "tts":
            text = msg.get("text", "")
            speaker_id = msg.get("speaker_id", 0)
            request_id = msg.get("request_id", "unknown")
            quantization = msg.get("quantization")

            if not text:
                send({"type": "error", "message": "empty text", "request_id": request_id})
                continue

            print(f"[sidecar] TTS request {request_id}: speaker={speaker_id}, "
                  f"text={text[:60]}{'...' if len(text) > 60 else ''}",
                  file=sys.stderr)
            sys.stderr.flush()

            try:
                handle_tts(text, speaker_id, request_id, quantization)
            except Exception as e:
                print(f"[sidecar] TTS error: {e}", file=sys.stderr)
                traceback.print_exc(file=sys.stderr)
                sys.stderr.flush()
                send({"type": "error", "message": str(e), "request_id": request_id})

        else:
            print(f"[sidecar] Unknown message type: {msg_type}", file=sys.stderr)
            sys.stderr.flush()


if __name__ == "__main__":
    main()
