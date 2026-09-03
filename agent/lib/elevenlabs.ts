// ElevenLabs speech-to-text (Scribe) and text-to-speech.
//
// Telegram voice notes arrive as OGG/Opus, which Scribe accepts directly, and
// TTS is requested as OGG/Opus so Telegram can send it back as a voice note.

const API = "https://api.elevenlabs.io/v1";

// Sarah, a premade voice. Library and professional voices need a paid plan,
// so the default has to be premade. Override with ELEVENLABS_VOICE_ID.
const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("Missing ELEVENLABS_API_KEY.");
  return key;
}

/** Transcribe an audio clip. Returns the text, or "" when nothing was heard. */
export async function transcribeAudio(
  audio: ArrayBuffer,
  mediaType = "audio/ogg",
): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([audio], { type: mediaType }), "voice.ogg");
  form.append("model_id", "scribe_v1");

  const res = await fetch(`${API}/speech-to-text`, {
    method: "POST",
    headers: { "xi-api-key": apiKey() },
    body: form,
  });

  if (!res.ok) {
    throw new Error(`ElevenLabs transcription failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as { text?: string };
  return (data.text ?? "").trim();
}

/** Render text as an OGG/Opus voice clip Telegram can send with sendVoice. */
export async function synthesizeSpeech(text: string): Promise<ArrayBuffer> {
  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";

  const res = await fetch(
    `${API}/text-to-speech/${voiceId}?output_format=opus_48000_64`,
    {
      method: "POST",
      headers: { "xi-api-key": apiKey(), "content-type": "application/json" },
      body: JSON.stringify({ text, model_id: modelId }),
    },
  );

  if (!res.ok) {
    throw new Error(`ElevenLabs speech failed (${res.status}): ${await res.text()}`);
  }

  return res.arrayBuffer();
}
