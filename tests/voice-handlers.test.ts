import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { handleSpeak, handleTranscribe, MAX_SPEAK_CHARS } from "#lib/voice-handlers.ts";
import { DEFAULT_OUTPUT_FORMAT, filenameForMediaType, synthesizeSpeech, transcribeAudio } from "#lib/elevenlabs.ts";

const KEY = "ios-key";
const BASE = "https://agent.test";
const realFetch = globalThis.fetch;
let calls: { url: string; init: RequestInit }[] = [];
let nextResponse: () => Response = () => new Response("{}");

beforeEach(() => {
  process.env.CLIENT_API_KEY = KEY;
  process.env.ELEVENLABS_API_KEY = "el-key";
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return nextResponse();
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

function audioRequest(opts: { key?: string | null; file?: Blob | null; field?: string } = {}) {
  const form = new FormData();
  const file = opts.file === undefined ? new Blob([new Uint8Array(64)], { type: "audio/mp4" }) : opts.file;
  if (file) form.append(opts.field ?? "file", file, "clip.m4a");
  return new Request(`${BASE}/transcribe`, {
    method: "POST",
    headers: opts.key === null ? {} : { authorization: `Bearer ${opts.key ?? KEY}` },
    body: form,
  });
}

function speakRequest(body: unknown, key: string | null = KEY, raw = false) {
  return new Request(`${BASE}/speak`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(key === null ? {} : { authorization: `Bearer ${key}` }),
    },
    body: raw ? (body as string) : JSON.stringify(body),
  });
}

test("transcribe: 401 without key", async () => {
  const res = await handleTranscribe(audioRequest({ key: null }));
  assert.equal(res.status, 401);
  assert.match(res.headers.get("www-authenticate") ?? "", /Bearer/);
  assert.equal(calls.length, 0);
});

test("transcribe: 401 with wrong key", async () => {
  const res = await handleTranscribe(audioRequest({ key: "bad" }));
  assert.equal(res.status, 401);
});

test("transcribe: 200 with text", async () => {
  nextResponse = () => Response.json({ text: "  hola mundo " });
  const res = await handleTranscribe(audioRequest());
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { text: "hola mundo" });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /speech-to-text/);
  const sent = calls[0].init.body as FormData;
  const file = sent.get("file") as File;
  assert.equal(file.name, "voice.m4a");
  assert.equal(sent.get("model_id"), "scribe_v2");
});

test("transcribe: empty transcript returns empty text", async () => {
  nextResponse = () => Response.json({});
  const res = await handleTranscribe(audioRequest());
  assert.deepEqual(await res.json(), { text: "" });
});

test("transcribe: 400 on missing, empty, unsupported, oversized file", async () => {
  let res = await handleTranscribe(audioRequest({ file: null }));
  assert.equal(res.status, 400);
  res = await handleTranscribe(audioRequest({ file: new Blob([], { type: "audio/mp4" }) }));
  assert.equal(res.status, 400);
  res = await handleTranscribe(audioRequest({ file: new Blob([new Uint8Array(8)], { type: "text/plain" }) }));
  assert.equal(res.status, 400);
  res = await handleTranscribe(
    audioRequest({ file: new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: "audio/mp4" }) }),
  );
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.code, "bad_request");
  assert.equal(calls.length, 0);
});

test("transcribe: 400 on non-multipart body", async () => {
  const res = await handleTranscribe(
    new Request(`${BASE}/transcribe`, {
      method: "POST",
      headers: { authorization: `Bearer ${KEY}`, "content-type": "text/plain" },
      body: "nope",
    }),
  );
  assert.equal(res.status, 400);
});

test("transcribe: 502 when ElevenLabs fails, without leaking the upstream body", async () => {
  nextResponse = () => new Response("secret quota details", { status: 429 });
  const res = await handleTranscribe(audioRequest());
  assert.equal(res.status, 502);
  const body = await res.json();
  assert.equal(body.code, "upstream_error");
  assert.match(body.error, /429/);
  assert.doesNotMatch(body.error, /secret/);
});

test("transcribe: 400 when content-length announces an oversized body", async () => {
  const req = new Request(`${BASE}/transcribe`, {
    method: "POST",
    headers: { authorization: `Bearer ${KEY}`, "content-length": String(50 * 1024 * 1024), "content-type": "multipart/form-data; boundary=x" },
    body: "x",
  });
  const res = await handleTranscribe(req);
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
});

test("speak: 500 misconfigured when ELEVENLABS_API_KEY is missing", async () => {
  delete process.env.ELEVENLABS_API_KEY;
  const res = await handleSpeak(speakRequest({ text: "hola" }));
  assert.equal(res.status, 500);
  assert.equal((await res.json()).code, "misconfigured");
});

test("speak: 401 with wrong key", async () => {
  const res = await handleSpeak(speakRequest({ text: "hola" }, "bad"));
  assert.equal(res.status, 401);
});

test("elevenlabs defaults keep the Telegram contract (opus + .ogg + multilingual model)", async () => {
  nextResponse = () => new Response(new Uint8Array([1]));
  delete process.env.ELEVENLABS_MODEL_ID;
  await synthesizeSpeech("hola");
  assert.match(calls[0].url, new RegExp(`output_format=${DEFAULT_OUTPUT_FORMAT}`));
  assert.equal(JSON.parse(calls[0].init.body as string).model_id, "eleven_multilingual_v2");
  assert.equal(DEFAULT_OUTPUT_FORMAT, "opus_48000_64");
  nextResponse = () => Response.json({ text: "x" });
  await transcribeAudio(new ArrayBuffer(8));
  assert.equal(((calls[1].init.body as FormData).get("file") as File).name, "voice.ogg");
});

test("speak: 401 without key", async () => {
  const res = await handleSpeak(speakRequest({ text: "hola" }, null));
  assert.equal(res.status, 401);
});

test("speak: 200 audio/mpeg using mp3 format", async () => {
  nextResponse = () => new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/mpeg" } });
  const res = await handleSpeak(speakRequest({ text: "hola" }));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("content-type"), "audio/mpeg");
  assert.deepEqual(new Uint8Array(await res.arrayBuffer()), new Uint8Array([1, 2, 3]));
  assert.match(calls[0].url, /output_format=mp3_44100_128/);
  const sent = JSON.parse(calls[0].init.body as string);
  assert.equal(sent.text, "hola");
  assert.equal(sent.model_id, "eleven_flash_v2_5");
});

test("speak: 400 on invalid text", async () => {
  for (const body of [{}, { text: "" }, { text: "   " }, { text: 5 }, { text: "x".repeat(MAX_SPEAK_CHARS + 1) }]) {
    const res = await handleSpeak(speakRequest(body));
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 40));
  }
  const res = await handleSpeak(speakRequest("{not json", KEY, true));
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
});

test("speak: 502 when ElevenLabs fails", async () => {
  nextResponse = () => new Response("boom", { status: 500 });
  const res = await handleSpeak(speakRequest({ text: "hola" }));
  assert.equal(res.status, 502);
});

test("filenameForMediaType maps types", () => {
  assert.equal(filenameForMediaType("audio/mp4"), "voice.m4a");
  assert.equal(filenameForMediaType("audio/mpeg"), "voice.mp3");
  assert.equal(filenameForMediaType("audio/wav"), "voice.wav");
  assert.equal(filenameForMediaType("audio/ogg; codecs=opus"), "voice.ogg");
  assert.equal(filenameForMediaType("application/octet-stream"), "voice.ogg");
});
