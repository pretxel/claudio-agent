// When the iOS app will speak the reply (X-Claudio-Mode: voice), shape it for the ear.

import { defineDynamic, defineInstructions } from "eve/instructions";
import { renderVoiceStyleInstructions } from "#lib/voice-prompt.ts";
import { appModelId } from "#lib/voice-handlers.ts";

export default defineDynamic({
  events: {
    "turn.started": (_event, ctx) => {
      const mode = ctx.session.auth.current?.attributes.mode;
      if (mode !== "voice") return null;
      // Audio tags only exist in Eleven v3; older models would read the brackets aloud.
      const audioTags = appModelId().startsWith("eleven_v3");
      return defineInstructions({ markdown: renderVoiceStyleInstructions({ audioTags }) });
    },
  },
});
