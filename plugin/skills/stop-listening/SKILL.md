---
name: stop-listening
description: Exit voice listening mode. Deactivates voice input so Claude can stop normally.
user-invocable: true
---

Exit voice listening mode. Call `set_voice_input` with `active: false` to disable voice input for your session. This will cause any active `wait_for_utterance` calls to return and allow you to stop normally.
