# 🚀 QUICK START GUIDE — Chat + TTS Feature

## Prerequisites

1. **Ollama Running** (for local LLM)
   ```bash
   # Download and install Ollama from https://ollama.ai
   # Start Ollama (usually runs at http://localhost:11434)
   ollama serve
   ```

2. **Have a Model Ready**
   ```bash
   ollama pull qwen:4b  # ~2.3 GB, fast
   # OR
   ollama pull neural-chat:7b  # ~4.1 GB, better quality
   ```

3. **CSM TTS (Optional but Recommended)**
   ```bash
   # If you have GPU with CUDA support
   cd C:/Files/Sesame/csm
   pip install -e .
   # Download model on first run (~4.15 GB)
   ```

## Start the App

```bash
cd C:/Files/Sesame/zain-companion
npm run tauri dev
```

Wait for:
1. "Vite server running" in terminal
2. "Cargo build complete" in terminal
3. Window appears on desktop (usually bottom-right)

## Test the Feature

### Test 1: Click and See Blob
1. Click the purple blob in the center of the window
2. You should see:
   - Blob turns light blue
   - Floating textbox appears above blob
   - Shows last message (or "Say something..." placeholder)
   - Input field is focused (cursor visible)

### Test 2: Send a Simple Message
1. Type: `Hello, how are you?`
2. Press Enter (or click send button)
3. You should see:
   - Input clears
   - Textbox closes (automatically after sending)
   - Blob turns deep blue (processing)
   - Textbox reopens showing response accumulating in real-time
   - 🎤 emoji appears while TTS generates
   - 3 bouncing bars appear when audio plays

### Test 3: Listen to Response
1. Keep the window open while audio plays
2. You should hear:
   - Clear, natural speech from speakers
   - Response matches what was typed in the textbox
   - Audio quality is high (Sesame CSM voice)

### Test 4: Check Full Chat History
1. Press **Ctrl+Space**
2. Window expands to show full chat panel
3. You should see:
   - "You: Hello, how are you?" (right-aligned, blue)
   - "Assistant: [response text]" (left-aligned, white)
   - Settings panel (gear icon, right side)

### Test 5: Change Settings
1. Click gear icon in expanded panel
2. Try changing:
   - **Provider**: Switch to OpenAI (if you have API key)
   - **Model**: Select different model
   - **Temperature**: Drag slider (left = precise, right = creative)
   - **Speaker ID**: Change voice (0-9, affects TTS output)

### Test 6: Send Multiple Messages
1. Press **Ctrl+Space** to collapse chat panel
2. Click blob again to open textbox
3. Send several messages:
   - "What's the capital of France?"
   - "Tell me a joke"
   - "Explain quantum computing in simple terms"
4. Watch each response stream in, hear it spoken

---

## Troubleshooting

### Issue: Blob doesn't respond to click
**Solution**: Make sure window has focus. Click on blob area explicitly.

### Issue: Textbox doesn't appear
**Solution**: 
- Check browser console (F12) for errors
- Make sure blob rendered (should see purple circle)
- Try refreshing with F5

### Issue: Message doesn't send
**Solution**:
- Check Ollama is running: `curl http://localhost:11434/api/models`
- Check network connection
- Try different model: `ollama pull neural-chat`
- Look at console for error messages

### Issue: No voice (no audio playing)
**Solution**:
- Check speaker volume is not muted
- If CSM not installed, will play test beep instead
- Check sidecar is running: Look for Python process in task manager
- Check GPU CUDA compatibility

### Issue: App crashes on startup
**Solution**:
- Check Node.js version: `node -v` (should be 18+)
- Rebuild: `npm install && npm run tauri dev`
- Check disk space (models need 50+ GB)
- Check environment variables

### Issue: Slow response time
**Solution**:
- Use smaller model: `qwen:4b` is fastest
- Check GPU is being used (watch GPU-Z during response)
- Close other heavy applications
- Check Ollama is not using CPU only

---

## What You Should See

### Ideal Flow
```
[1] Click purple blob
    ↓
[2] Blob turns light blue, textbox appears
    ↓
[3] Type message in input field
    ↓
[4] Press Enter or click send button
    ↓
[5] Textbox closes, blob turns deep blue
    ↓
[6] Textbox opens showing "thinking" dots
    ↓
[7] Response text accumulates with cursor blinking
    ↓
[8] 🎤 emoji shows (TTS generating)
    ↓
[9] ▁▂▃ bouncing bars show (audio playing)
    ↓
[10] You hear the response spoken
    ↓
[11] Blob turns purple again, ready for next message
```

### Audio Indicators Explained
| Indicator | Meaning |
|-----------|---------|
| 🎤 | TTS model generating voice (CSM processing) |
| ▁▂▃ | Audio chunks arriving and playing |
| ◉ | Blob idle (ready for input) |
| ◉ (light blue) | Textbox open |
| ◉ (deep blue) | Processing LLM or TTS |
| ◯ with ↗ | Dragging blob |

---

## Tips & Tricks

### Fast Response
- Use `qwen:4b` or `qwen2.5-coder:7b` (both fast)
- Set Temperature = 0.5 (less rambling)
- Keep context window small (Settings → Context Messages = 3)

### Better Audio Quality
- Use GPU (CUDA enabled PyTorch)
- Speaker ID 0-9 affect voice characteristics (try ID 0 for warmth, ID 5 for clarity)
- Quantization FP16 (highest quality), INT8 (good), INT4 (fast but lower quality)

### Drag the Blob
- Click and drag to move blob anywhere on screen
- Window stays on top, always accessible
- Drag threshold: must move >5px to start drag (prevents accidental drag)

### Full Chat History
- Press **Ctrl+Space** to see all previous messages
- Shows complete conversation including tokens
- Can scroll up to see older messages
- Settings available in expanded view

### Quick Restart
- Press **F5** to reload without restarting Tauri
- Hot reload works for component changes
- Rust backend changes need full restart

---

## Performance Expectations

### First Run
- **Startup**: 3-5 seconds (sidecar init)
- **First message**: 8-10 seconds (model warm-up)

### Subsequent Messages
- **LLM response**: 2-4 seconds (depends on model and response length)
- **TTS generation**: 2-3 seconds (CSM on RTX 4070)
- **Audio playback**: <1 second latency after TTS starts

### Total Time (end-to-end)
- Optimal: 5-7 seconds (message → voice heard)
- Depends on: GPU speed, model size, response length

---

## Keyboard Shortcuts Reference

| Shortcut | Action | Context |
|----------|--------|---------|
| Click blob | Toggle textbox | Anywhere |
| Drag blob | Move window | Anywhere |
| **Enter** | Send message | Textbox open |
| **Escape** | Close textbox | Textbox open |
| **Escape** | Close chat panel | Chat expanded |
| **Ctrl+Space** | Toggle full chat | Anywhere |
| **F5** | Reload app | Anytime |
| **F12** | Open DevTools | Debug |

---

## Next Steps

After testing:
1. Try different models and compare responses
2. Experiment with temperature settings
3. Test different provider (OpenAI, Anthropic, etc.)
4. Leave feedback about:
   - Voice quality
   - Response accuracy
   - UI/UX improvements
   - Performance issues
   - Feature requests

---

## Support

If something doesn't work:
1. Check **console** for errors (F12 → Console tab)
2. Check **network** (F12 → Network tab) for failed requests
3. Check **Ollama** is running and has models
4. Restart app completely (close window, run dev again)
5. Rebuild from scratch:
   ```bash
   rm -rf node_modules src-tauri/target
   npm install
   npm run tauri dev
   ```

---

**Ready? Click the blob and say hello! 👋**
