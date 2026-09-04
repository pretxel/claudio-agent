// HTTP handlers behind the `voice` channel. Kept free of eve channel wiring so
// they can be unit-tested with plain Request/Response objects.

import { createUnauthorizedResponse } from "eve/channels/auth";
import { isValidApiKey } from "#lib/api-key-auth.ts";
import { synthesizeSpeech, transcribeAudio } from "#lib/elevenlabs.ts";

// Vercel rejects function bodies over 4.5 MB before the handler runs; stay under it so the client
// always receives the documented JSON error shape. A 120 s AAC clip is well under 1 MB.
export const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
export const MAX_SPEAK_CHARS = 4000;
export const SPEAK_OUTPUT_FORMAT = "mp3_44100_128";
/** Low-latency multilingual model for sentence-by-sentence playback in the app (turbo v2.5 is deprecated). */
export const DEFAULT_APP_MODEL_ID = "eleven_flash_v2_5";
export function appModelId(): string {
  return process.env.ELEVENLABS_APP_MODEL_ID || DEFAULT_APP_MODEL_ID;
}

const ACCEPTED_AUDIO_TYPES = new Set([
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/webm",
]);

function badRequest(error: string): Response {
  return Response.json({ ok: false, code: "bad_request", error }, { status: 400 });
}

function upstreamError(route: string, error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[voice] ${route} failed:`, message.slice(0, 2000));
  if (message.startsWith("Missing ELEVENLABS_API_KEY")) {
    return Response.json({ ok: false, code: "misconfigured", error: "Speech service is not configured." }, { status: 500 });
  }
  const status = /\((\d{3})\)/.exec(message)?.[1];
  const error_ = status ? `Speech service failed (${status}).` : "Speech service failed.";
  return Response.json({ ok: false, code: "upstream_error", error: error_ }, { status: 502 });
}

function contentLengthExceeds(request: Request, limit: number): boolean {
  const raw = request.headers.get("content-length");
  const length = raw ? Number(raw) : NaN;
  return Number.isFinite(length) && length > limit;
}

function unauthorized(): Response {
  return createUnauthorizedResponse({ challenges: [{ scheme: "Bearer" }] });
}

function normalizeMediaType(type: string): string {
  return type.split(";")[0].trim().toLowerCase();
}

/** POST /transcribe — multipart `file` → { text }. */
export async function handleTranscribe(request: Request): Promise<Response> {
  if (!isValidApiKey(request)) return unauthorized();
  if (contentLengthExceeds(request, MAX_AUDIO_BYTES + 4096)) {
    return badRequest(`Request exceeds ${MAX_AUDIO_BYTES} bytes.`);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return badRequest("Expected multipart/form-data with a `file` field.");
  }

  const file = form.get("file");
  if (!(file instanceof Blob)) return badRequest("Missing `file` field.");
  if (file.size === 0) return badRequest("`file` is empty.");
  if (file.size > MAX_AUDIO_BYTES) return badRequest(`\`file\` exceeds ${MAX_AUDIO_BYTES} bytes.`);

  const mediaType = normalizeMediaType(file.type || "");
  if (!ACCEPTED_AUDIO_TYPES.has(mediaType)) {
    return badRequest(`Unsupported media type "${file.type || "unknown"}".`);
  }

  try {
    const text = await transcribeAudio(await file.arrayBuffer(), mediaType);
    return Response.json({ text });
  } catch (error) {
    return upstreamError("transcribe", error);
  }
}

/** POST /speak — JSON { text } → audio/mpeg. */
export async function handleSpeak(request: Request): Promise<Response> {
  if (!isValidApiKey(request)) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Expected a JSON body.");
  }

  const text = (body as { text?: unknown } | null)?.text;
  if (typeof text !== "string" || text.trim().length === 0) {
    return badRequest("`text` must be a non-empty string.");
  }
  if (text.length > MAX_SPEAK_CHARS) {
    return badRequest(`\`text\` exceeds ${MAX_SPEAK_CHARS} characters.`);
  }

  try {
    const audio = await synthesizeSpeech(text, { outputFormat: SPEAK_OUTPUT_FORMAT, modelId: appModelId() });
    return new Response(audio, {
      status: 200,
      headers: { "content-type": "audio/mpeg", "cache-control": "no-store" },
    });
  } catch (error) {
    return upstreamError("speak", error);
  }
}
