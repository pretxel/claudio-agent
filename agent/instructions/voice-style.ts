// When the iOS app will speak the reply (X-Claudio-Mode: voice), shape it for the ear.

import { defineDynamic, defineInstructions } from "eve/instructions";
import { renderVoiceStyleInstructions } from "#lib/voice-prompt.ts";

export default defineDynamic({
  events: {
    "turn.started": (_event, ctx) => {
      const mode = ctx.session.auth.current?.attributes.mode;
      return mode === "voice" ? defineInstructions({ markdown: renderVoiceStyleInstructions() }) : null;
    },
  },
});
