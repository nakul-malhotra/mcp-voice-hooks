Enter voice listening mode. Follow these steps exactly:

1. Call `set_voice_input` with `active: true` to enable voice input for your session.
2. Call `wait_for_utterance` to begin listening for voice input.
3. When utterances arrive, process them and respond normally (use `speak` if voice responses are enabled).
4. After responding, call `wait_for_utterance` again to continue listening.
5. Repeat steps 2-4 until the user says "stop listening" or voice input is deactivated.

Do not stop or end your response while in listening mode. Stay in the wait loop.
