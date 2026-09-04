// ElevenLabs speech-to-text (Scribe) and text-to-speech.
//
// Telegram voice notes arrive as OGG/Opus, which Scribe accepts directly, and
// Telegram replies are requested as OGG/Opus so they can be sent as voice
// notes. The iOS app uploads AAC (.m4a) and asks for MP3 back.

const API = "https://api.elevenlabs.io/v1";

// Sarah, a premade voice. Library and professional voices need a paid plan,
// so the default has to be premade. Override with ELEVENLABS_VOICE_ID.
const DEFAULT_VOICE_ID = "EXAVITQu4vr4xnSDxMaL";

export const DEFAULT_OUTPUT_FORMAT = "opus_48000_64";

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error("Missing ELEVENLABS_API_KEY.");
  return key;
}

/** Filename extension Scribe should see for a given media type. */
export function filenameForMediaType(mediaType: string): string {
  const type = mediaType.split(";")[0].trim().toLowerCase();
  switch (type) {
    case "audio/mp4":
    case "audio/m4a":
    case "audio/x-m4a":
    case "audio/aac":
      return "voice.m4a";
    case "audio/mpeg":
    case "audio/mp3":
      return "voice.mp3";
    case "audio/wav":
    case "audio/x-wav":
    case "audio/wave":
      return "voice.wav";
    case "audio/webm":
      return "voice.webm";
    default:
      return "voice.ogg";
  }
}

/** Transcribe an audio clip. Returns the text, or "" when nothing was heard. */
export async function transcribeAudio(
  audio: ArrayBuffer,
  mediaType = "audio/ogg",
): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([audio], { type: mediaType }), filenameForMediaType(mediaType));
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

export type SynthesizeOptions = {
  /** ElevenLabs output_format, e.g. "opus_48000_64" (default) or "mp3_44100_128". */
  outputFormat?: string;
};

/** Render text as speech. Defaults to OGG/Opus for Telegram voice notes. */
export async function synthesizeSpeech(
  text: string,
  options: SynthesizeOptions = {},
): Promise<ArrayBuffer> {
  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID;
  const modelId = process.env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
  const outputFormat = options.outputFormat ?? DEFAULT_OUTPUT_FORMAT;

  const res = await fetch(
    `${API}/text-to-speech/${voiceId}?output_format=${encodeURIComponent(outputFormat)}`,
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
