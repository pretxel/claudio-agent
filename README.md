# claudio-agent

Personal assistant built on the [eve](https://eve.dev) framework. A root
orchestrator answers directly, reads your Google Calendar and Gmail, and
delegates heavier work to three specialist subagents. All models route through
[OpenRouter](https://openrouter.ai), and you talk to the agent over Telegram.

## How it works

```
Telegram bot ──▶ Claudio ──▶ researcher   (web search + page reading)
                    │    ──▶ planner      (goal → ordered plan with dates)
                    │    ──▶ summarizer   (long material → short brief)
                    │
                    └──▶ Google Calendar + Gmail + web search
                    ▼
              Answer back to you
```

Google tools live on the orchestrator only. Subagents never see your mail or
calendar unless the orchestrator puts it in their brief.

## Project structure

```
agent/
├── agent.ts                     # Root orchestrator config
├── instructions.md              # Orchestrator system prompt
├── lib/
│   ├── model.ts                 # OpenRouter model selection (single source of truth)
│   ├── google.ts                # Google OAuth token minting + REST helpers
│   ├── tavily.ts                # Web search and page extraction
│   ├── elevenlabs.ts            # Speech-to-text and text-to-speech
│   └── telegram-media.ts        # Voice note download and sendVoice
├── tools/
│   ├── agent.ts                 # Disables the built-in self-copy tool
│   ├── calendar_list_events.ts  # Read events in a time window
│   ├── calendar_create_event.ts # Create an event
│   ├── gmail_search.ts          # Gmail query syntax search
│   ├── gmail_read_message.ts    # Read one message body
│   └── web_search.ts            # Tavily search
├── channels/
│   ├── telegram.ts              # Telegram bot channel
│   └── eve.ts                   # Default HTTP/TUI channel (local dev + TUI)
└── subagents/
    ├── researcher/              # own tools/: web_search, web_fetch
    ├── planner/
    └── summarizer/
scripts/
├── google-auth.mjs              # One-time helper to mint a Google refresh token
└── telegram.mjs                 # Bot setup: user id, webhook register/inspect
```

## Models

Model selection lives in `agent/lib/model.ts` — change models in that one file.

| Agent        | Model                         |
| ------------ | ----------------------------- |
| Orchestrator | `anthropic/claude-sonnet-4.5` |
| Researcher   | `google/gemini-2.5-flash`     |
| Planner      | `anthropic/claude-sonnet-4.5` |
| Summarizer   | `openai/gpt-4o-mini`          |

Models are AI SDK `LanguageModel` instances from `@openrouter/ai-sdk-provider`,
so each `agent.ts` must set `modelContextWindowTokens` explicitly — eve cannot
infer context windows for direct provider models.

## Setup

Requires Node.js 24.

```bash
npm install
cp .env.example .env.local   # then fill it in
```

## Google access

The Google tools act as one account (yours) using a refresh token — there is no
per-user OAuth consent flow.

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials),
   create a project, enable the **Gmail API** and the **Google Calendar API**,
   and create an OAuth client of type **Desktop app**.
2. Add yourself as a test user on the OAuth consent screen.
3. Mint a refresh token:

   ```bash
   GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... node scripts/google-auth.mjs
   ```

   Open the printed URL, approve, and copy `GOOGLE_REFRESH_TOKEN` into `.env.local`.

Scopes requested: `calendar.events` (read + write) and `gmail.readonly`. The
agent can create calendar events; it cannot send or delete mail. To grant more,
edit `scopes` in `scripts/google-auth.mjs` and mint the token again.

## Run locally

```bash
npm run dev          # eve dev server + interactive REPL
npm run typecheck    # tsc
```

## Web search

`web_search` (Tavily) sits on the orchestrator for one-off facts. The
`researcher` subagent has its own copy plus `web_fetch`, which pulls the full
text of a page when a search extract is too thin.

Get a key at [app.tavily.com](https://app.tavily.com) and set `TAVILY_API_KEY`.
Searches default to `basic` depth; the model escalates to `advanced` on its own
when results come back thin, and `topic: "news"` narrows to a recent window.

## Voice notes

The bot transcribes inbound voice notes and speaks its replies, both through
[ElevenLabs](https://elevenlabs.io). eve's Telegram channel only parses photos
and documents, so `agent/channels/telegram.ts` pulls the audio file id out of
the raw update itself, transcribes it with Scribe, and writes the transcript
onto the message so the turn is not empty.

Set `ELEVENLABS_API_KEY`. Two limits worth knowing:

- On the free plan only **premade** voices work through the API. Library and
  professional voices return `402 paid_plan_required`, Spanish ones included.
  The default is Sarah (`EXAVITQu4vr4xnSDxMaL`) with `eleven_multilingual_v2`.
- Replies over 1200 characters are sent as text only, since ElevenLabs bills per
  character. `TELEGRAM_VOICE_REPLY=off` turns speech off entirely; the text
  reply is always sent either way.

## Telegram bot

The bot speaks for your Google account, so it only answers you: private chats
from a user id in `TELEGRAM_ALLOWED_USER_IDS`. Everything else is dropped
silently (`agent/channels/telegram.ts`). With the list empty, the bot answers
nobody.

1. Create the bot with [@BotFather](https://t.me/BotFather) (`/newbot`) and put
   the token in `.env.local` as `TELEGRAM_BOT_TOKEN`.
2. Find your user id — send the bot any message first, then:

   ```bash
   node scripts/telegram.mjs whoami
   ```

   Copy the printed `TELEGRAM_ALLOWED_USER_IDS=...` into `.env.local`.
3. Push all Telegram vars to Vercel and redeploy:

   ```bash
   vercel env add TELEGRAM_BOT_TOKEN production
   vercel env add TELEGRAM_WEBHOOK_SECRET_TOKEN production
   vercel env add TELEGRAM_ALLOWED_USER_IDS production
   vercel deploy --prod
   ```
4. Register the webhook against the deployed URL (eve mounts the route but
   never calls `setWebhook` itself):

   ```bash
   node scripts/telegram.mjs set-webhook https://claudio-agent.vercel.app/eve/v1/telegram
   node scripts/telegram.mjs info          # verify: url set, pending_update_count, last_error
   ```

`node scripts/telegram.mjs delete-webhook` unregisters it — do that before
running `whoami` again, since `getUpdates` and a webhook are mutually exclusive.

## Production notes

- Keep `TELEGRAM_ALLOWED_USER_IDS` set. Without it the bot ignores everyone;
  with the wrong id in it, a stranger reads your mail.
- `agent/channels/eve.ts` ships with scaffold `placeholderAuth()` — replace it
  with a real auth provider before exposing the HTTP route publicly.
- `npm run build` / `npm start` for production build and serve.

## Long-term memory

Claudio remembers stable facts across conversations and channels with the `remember`, `forget`
and `list_memories` tools. Storage is the team's Upstash Redis (`upstash-kv-indigo-school`,
connected via `vercel integration resource connect`), hash `claudio:memory:owner`. Memories are
injected into the system prompt at the start of every turn by `agent/instructions/memory.ts`.
Without `KV_REST_API_URL`/`KV_REST_API_TOKEN` the agent falls back to an in-process store and
says so. Run `vercel env pull` to get the credentials locally.
