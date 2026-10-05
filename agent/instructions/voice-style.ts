// When the reply will be spoken — the iOS app sends X-Claudio-Mode: voice, and
// the Telegram channel marks turns that started from a voice note — shape it for the ear.

import { defineDynamic, defineInstructions } from "eve/instructions";
import { renderVoiceStyleInstructions } from "#lib/voice-prompt.ts";
import { appModelId } from "#lib/voice-handlers.ts";
import { DEFAULT_MODEL_ID } from "#lib/elevenlabs.ts";

export default defineDynamic({
  events: {
    "turn.started": (_event, ctx) => {
      const auth = ctx.session.auth.current;
      if (auth?.attributes.mode !== "voice") return null;
      // Telegram voice notes and the app use different TTS models.
      const modelId =
        auth.authenticator === "telegram-webhook"
          ? process.env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL_ID
          : appModelId();
      // Audio tags only exist in Eleven v3; older models would read the brackets aloud.
      const audioTags = modelId.startsWith("eleven_v3");
      return defineInstructions({ markdown: renderVoiceStyleInstructions({ audioTags }) });
    },
  },
});
