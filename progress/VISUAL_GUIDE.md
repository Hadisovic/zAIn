# 🎯 Visual Guide — Chat + TTS User Experience

## Screen States

### State 1: Idle (Blob Floating)
```
┌────────────────────────────────┐
│        Desktop                 │
│                                │
│                     ◉          │
│                   (purple)     │
│                 draggable      │
│                  blob          │
│                                │
└────────────────────────────────┘
```

### State 2: Blob Clicked (Textbox Opens)
```
┌────────────────────────────────┐
│        Desktop                 │
│                                │
│                     ◉ ← blue   │
│              (light blue)       │
│                                │
│              ┌──────────────┐  │
│              │ Say somethi…│  │
│              │              │  │
│              │ [text field] │  │
│              │   [send →]   │  │
│              └──────────────┘  │
│                  △ pointer     │
└────────────────────────────────┘
```

### State 3: Message Sent (Processing)
```
┌────────────────────────────────┐
│        Desktop                 │
│                                │
│                   ◉ (deep blue)│
│              (processing…)     │
│                                │
│              ┌──────────────┐  │
│              │ AI is thinking│ │
│              │ ... (dots)   │  │
│              │              │  │
│              │ [text field] │  │
│              │  [⏳ send]   │  │
│              └──────────────┘  │
│                                │
└────────────────────────────────┘
```

### State 4: Response Streaming
```
┌────────────────────────────────┐
│        Desktop                 │
│                                │
│                   ◉ (deep blue)│
│           (generating voice…) │
│                                │
│              ┌──────────────┐  │
│              │ Hi! I'm Zain│  │
│              │ I can help… │  │
│              │ 🎤          │  │
│              │              │  │
│              │ [text field] │  │
│              │  [⏳ send]   │  │
│              └──────────────┘  │
│                                │
└────────────────────────────────┘
Text accumulates with cursor ↯
```

### State 5: Audio Playing
```
┌────────────────────────────────┐
│        Desktop                 │
│                                │
│                   ◉ (deep blue)│
│           (speaking…)          │
│                                │
│              ┌──────────────┐  │
│              │ Hi! I'm Zain│  │
│              │ I can help… │  │
│              │ ▁▂▃ ▁▂▃     │  │
│              │              │  │
│              │ [text field] │  │
│              │  [⏳ send]   │  │
│              └──────────────┘  │
│                                │
│         🔊 Speaker playing      │
└────────────────────────────────┘
```

### State 6: Ready for Next Message
```
┌────────────────────────────────┐
│        Desktop                 │
│                                │
│                     ◉          │
│                   (purple)     │
│                 ready again    │
│                                │
│              ┌──────────────┐  │
│              │ Hi! I'm Zain│  │
│              │ I can help… │  │
│              │              │  │
│              │ [text field] │  │
│              │   [send →]   │  │
│              └──────────────┘  │
│                  △ pointer     │
└────────────────────────────────┘
```

---

## User Interaction Flow

```
┌─ START
│
├─ IDLE STATE
│  │  ◉ Blob visible (purple, breathing)
│  │  No textbox
│  │  Awaiting user interaction
│  │
│  └─ User action: CLICK BLOB
│     │
│     ▼
│
├─ TEXTBOX OPENS
│  │  ◉ Blob turns light blue
│  │  Floating textbox appears
│  │  Input field is focused (cursor visible)
│  │  Shows last message (if any)
│  │
│  └─ User action: TYPE MESSAGE
│     │
│     ▼
│
├─ MESSAGE INPUT
│  │  User types in textbox
│  │  Input is active and responsive
│  │  Can see what they're typing
│  │
│  └─ User action: PRESS ENTER or CLICK SEND
│     │
│     ▼
│
├─ SENDING
│  │  ◉ Blob turns deep blue
│  │  Message added to history (user role)
│  │  Input clears
│  │  Send button disabled + spinner
│  │  Status: Sending to LLM…
│  │
│  └─ Automatic: LLM request sent
│     │
│     ▼
│
├─ RECEIVING (LLM STREAMING)
│  │  ◉ Blob stays deep blue
│  │  Assistant message appears (empty at first)
│  │  Shows "thinking" dots (▊)
│  │  Tokens start arriving…
│  │
│  └─ Automatic: First token received
│     │
│     ▼
│
├─ TEXT ACCUMULATING
│  │  ◉ Blob stays deep blue
│  │  Assistant message shows:
│  │    "Hi" → "Hi there" → "Hi there! How…"
│  │  Blinking cursor shows streaming
│  │  More tokens arriving in real-time
│  │
│  └─ Automatic: All tokens received
│     │
│     ▼
│
├─ LLM COMPLETE
│  │  ◉ Blob stays deep blue
│  │  Full assistant message displayed
│  │  Cursor animation stops
│  │  Status: TTS generating voice…
│  │  Icon: 🎤 microphone emoji shown
│  │
│  └─ Automatic: TTS triggered
│     │
│     ▼
│
├─ VOICE GENERATING
│  │  ◉ Blob still deep blue
│  │  🎤 emoji visible in textbox
│  │  Audio chunks starting to arrive
│  │  Status: Synthesizing speech…
│  │
│  └─ Automatic: Audio playback starts
│     │
│     ▼
│
├─ AUDIO PLAYING
│  │  ◉ Blob stays deep blue
│  │  Bouncing bars animation: ▁▂▃
│  │  User hears response spoken
│  │  Audio plays progressively
│  │  Status: Playing audio…
│  │
│  └─ Automatic: Audio playback ends
│     │
│     ▼
│
├─ COMPLETE & READY
│  │  ◉ Blob returns to purple
│  │  Textbox remains open (or closes automatically)
│  │  Input field is active again
│  │  Send button enabled
│  │  Status: Ready for next message
│  │
│  └─ User can: Type another message OR close textbox
│     │
│     ├─ Type again → back to MESSAGE INPUT
│     │
│     └─ Close (Escape or click outside) → back to IDLE STATE
│
└─ END
```

---

## Message Display Evolution

### Initial State
```
┌──────────────────────────────┐
│  Last response (if any):     │
│  (none on first message)     │
│                              │
│  Input: [ Type here...     ] │
│         [ Send →          ]  │
└──────────────────────────────┘
```

### After Sending
```
┌──────────────────────────────┐
│  Last response:              │
│  (still showing previous)    │
│                              │
│  Input: [ .............. ] ← cleared │
│         [ ⏳ Sending...    ]  │ disabled
└──────────────────────────────┘
```

### LLM Streaming
```
┌──────────────────────────────┐
│  Current response:           │
│  Hi there! I'm Zain. I can  │
│  help you with...↯           │ ← cursor
│  (more text arriving)        │
│                              │
│  Input: [ .............. ]   │ disabled
│         [ ⏳ Generating...  ] │
└──────────────────────────────┘
```

### TTS Generating
```
┌──────────────────────────────┐
│  Current response:           │
│  Hi there! I'm Zain. I can  │
│  help you with any questions.│
│  🎤                          │ ← TTS generating
│                              │
│  Input: [ .............. ]   │ disabled
│         [ ⏳ Voice...      ]  │
└──────────────────────────────┘
```

### Audio Playing
```
┌──────────────────────────────┐
│  Current response:           │
│  Hi there! I'm Zain. I can  │
│  help you with any questions.│
│  ▁▂▃ ▁▂▃ ▁▂▃ ▁▂▃           │ ← audio bars
│                              │
│  Input: [ .............. ]   │ disabled
│         [ ⏳ Playing...     ] │
└──────────────────────────────┘
      🔊 Audio playing...
```

### Ready for Next Message
```
┌──────────────────────────────┐
│  Last response:              │
│  Hi there! I'm Zain. I can  │
│  help you with any questions.│
│                              │
│  Input: [ Type here...     ] │ ← enabled
│         [ Send →          ]  │
└──────────────────────────────┘
```

---

## Keyboard & Mouse Actions

### Keyboard
```
┌─ ESC
│  ├─ Textbox open → Close textbox
│  └─ Chat expanded → Close chat panel
│
├─ ENTER (in textbox)
│  ├─ Not processing → Send message
│  └─ Processing → Do nothing (disabled)
│
├─ CTRL+SPACE
│  ├─ Collapsed → Expand to full chat panel
│  └─ Expanded → Collapse to blob only
│
└─ F5
   └─ Reload application (for development)
```

### Mouse
```
┌─ CLICK on blob
│  ├─ Movement < 5px → Toggle textbox
│  └─ Movement > 5px → Skip (drag started)
│
├─ DRAG blob
│  ├─ Hold + move → Move window to new location
│  └─ Release → Stop dragging
│
├─ CLICK on input field
│  ├─ Not processing → Focus and type
│  └─ Processing → Can't interact (disabled)
│
├─ CLICK on send button
│  ├─ Not processing → Send message
│  └─ Processing → Shows spinner (disabled)
│
└─ CLICK outside textbox
   └─ Textbox open → Close textbox
```

---

## Visual Indicators Summary

### Blob States
```
◉ PURPLE (breathing)
  └─ Idle, ready to chat

◉ LIGHT BLUE
  └─ Textbox open, awaiting input

◉ DEEP BLUE + 🌟 (glowing)
  └─ Processing (LLM or TTS)

◉ CYAN
  └─ Being dragged

◉ PURPLE (pulsing)
  └─ Just finished, settling back
```

### Text Input States
```
[ Type here... ]  ← Normal, ready
                  
[ ............. ] ← Disabled (grayed)
                  
[ Your message.. ] ← With cursor (can type)
```

### Send Button States
```
[send →]         ← Normal, clickable

[⏳ send]        ← Loading/processing (spinner)

[⏳ send]        ← Disabled, grayed out
(grayed)
```

### Response Display States
```
•••              ← Thinking (three bouncing dots)

Hello there! ...↯ ← Streaming (cursor visible)

Hello there! ... ← Complete (no cursor)

🎤               ← TTS generating voice

▁▂▃ ▁▂▃ ▁▂▃     ← Audio playing (bouncing bars)
```

---

## Timeline Example

### Real Scenario: User Asks "What's 2+2?"

```
[0s]   User clicks blob
       ◉ → light blue, textbox opens

[0.1s] User types: "What's 2+2?"
       Input shows: [What's 2+2?]

[1.5s] User presses Enter
       ◉ → deep blue
       Input clears, disabled
       Shows: [...............]

[2s]   Message sent to Ollama
       Shows: LLM processing...

[3s]   First tokens arrive
       Shows: "The answer is 4"
       Cursor blinking at end: "...4"↯

[5s]   LLM complete
       Shows full response: "The answer is 4 because 2 + 2 = 4."
       Icon appears: 🎤

[6s]   TTS starts
       Shows: "The answer is 4..." with 🎤

[8s]   Audio arrives, playback starts
       Shows: ▁▂▃ (bouncing bars)
       Speaker plays: "The answer is 4..."

[9s]   Audio complete
       ◉ → purple
       Ready for next message
       Input: [Type here...]
```

---

## Full Chat Panel (Ctrl+Space)

```
┌────────────────────────────────────────┐
│         ZAIN COMPANION                │
│  ⚙️               [X]                   │
├────────────────────────────────────────┤
│                                        │
│  YOU (right-aligned, blue):            │
│                    What's 2+2?        │
│                                        │
│  ZAIN (left-aligned, white):           │
│  The answer is 4 because 2+2=4.  ✓    │
│                                        │
│  YOU:                                  │
│                    Tell me a joke      │
│                                        │
│  ZAIN:                                 │
│  Why did the chicken cross the road?   │
│  To get to the other side!        ✓   │
│                                        │
│  [Input box for longer messages...]    │
│  [Send →]                              │
│                                        │
├────────────────────────────────────────┤
│  Settings Panel (click ⚙️):            │
│  • Provider: [Ollama ▼]                │
│  • Model: [qwen:4b ▼]                  │
│  • Temp: [████░░░░░░] 0.7             │
│  • Voice: Speaker ID [0-9 grid]        │
│  • Quantization: [fp16/int8/int4]      │
└────────────────────────────────────────┘
```

---

## Error States

### LLM Error
```
┌──────────────────────────────┐
│  ZAIN:                       │
│  Error: Connection failed    │
│  Please check Ollama is      │
│  running.                    │
│                              │
│  Input: [ Type here...     ] │ ← enabled
│         [ Send →          ]  │
└──────────────────────────────┘
```

### TTS Error
```
┌──────────────────────────────┐
│  ZAIN:                       │
│  The LLM worked fine but     │
│  voice synthesis failed.     │
│  (Showing text only)         │
│                              │
│  Input: [ Type here...     ] │ ← enabled
│         [ Send →          ]  │
└──────────────────────────────┘
```

---

## Performance Indicators

### Fast Response (2-3 sec)
```
Send  [⏳]  →  [▁▂▃]  →  Done ✓
       0s        1s        2s
```

### Typical Response (5-7 sec)
```
Send  [⏳ Sending...]  →  [🎤 TTS...]  →  [▁▂▃ Audio]  →  Done ✓
       0s                 3s              5s              7s
```

### Slow Response (10+ sec, CPU only)
```
Send  [⏳ Waiting...]  →  [🎤 Generating...]  →  [▁▂▃ Playing...]  →  Done ✓
       0s               5s                      15s                   20s
```

---

**Visual Experience: Clean, Intuitive, Responsive**
