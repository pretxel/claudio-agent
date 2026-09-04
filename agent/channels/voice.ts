// Stateless audio helpers for the iOS app: speech-to-text in, text-to-speech
// out. Conversation itself goes through the `eve` HTTP channel; these routes
// never touch sessions.

import { defineChannel, POST } from "eve/channels";
import { handleSpeak, handleTranscribe } from "#lib/voice-handlers.ts";

export default defineChannel({
  routes: [
    POST("/transcribe", (request) => handleTranscribe(request)),
    POST("/speak", (request) => handleSpeak(request)),
  ],
});
