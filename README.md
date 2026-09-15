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

All requests are pinned to the Amazon Bedrock provider on OpenRouter
(`provider: { only: ["amazon-bedrock"], allow_fallbacks: false }`) so they bill
against your Bedrock BYOK key. Only pick models that Bedrock serves, and turn on
"Always use this key" for Bedrock in OpenRouter's integration settings so a
failing key errors instead of spending OpenRouter credits.

| Agent        | Model                         |
| ------------ | ----------------------------- |
| Orchestrator | `anthropic/claude-sonnet-4.5` |
| Researcher   | `anthropic/claude-haiku-4.5`  |
| Planner      | `anthropic/claude-sonnet-4.5` |
| Summarizer   | `anthropic/claude-haiku-4.5`  |

Models are AI SDK `LanguageModel` instances from `@openrouter/ai-sdk-provider`,
so each `agent.ts` must set `modelContextWindowTokens` explicitly — eve cannot
infer context windows for direct provider models.

## Setup

Requires Node.js 24.

```bash
npm install
cp .env.example .env.local   # then fill it in
```

Set `CLAUDIO_TIME_ZONE` to the owner's IANA time zone (for example,
`Europe/Madrid`). Claudio receives the current UTC instant, local date, local
time, UTC offset, and time zone at the start of every turn, so phrases such as
"today" and "tomorrow" keep working in long-lived conversations.

## Google access

The Google tools act as one account (yours) through the Vercel Connect connector
`google/claudio-google`. Connect stores the OAuth grant and automatically rotates
the short-lived access token used by the agent.

Scopes requested: `calendar.events` (read + write) and `gmail.readonly`. The
agent can create calendar events; it cannot send or delete mail.

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

## Reminders and morning brief

Claudio can set reminders ("recuérdame mañana a las 9 llamar a mamá") and sends
a morning brief every day on Telegram. Both are driven by
[Upstash QStash](https://upstash.com/docs/qstash) rather than Vercel Cron:
Vercel Hobby only allows daily crons that fire anywhere within the hour, and
evaluates them in UTC.

- Each pending reminder is one delayed QStash message that calls
  `POST /eve/v1/qstash/reminder` at its due time. The route verifies the
  `Upstash-Signature`, sends the text straight to Telegram (no model call), and
  enqueues the next occurrence for `daily`, `weekdays`, or `weekly` reminders.
  Reminders live in the same Upstash Redis as long-term memory.
- QStash's free plan caps delays at 7 days, so a reminder further out hops:
  the message arrives early, sees it is not due yet, and re-queues itself. Set
  `QSTASH_MAX_DELAY_DAYS` if your plan allows longer.
- The morning brief is a QStash schedule that calls
  `POST /eve/v1/qstash/morning-brief`. That starts a normal agent session on
  Telegram, so Claudio reads today's calendar, recent unread mail, and today's
  reminders with its own tools. Replying continues the conversation.

Setup:

```bash
vercel integration add upstash/upstash-qstash   # adds QSTASH_* to the project
vercel --prod                                   # deploy the new routes first

# Register the brief (idempotent; re-run after changing the time)
CLAUDIO_PUBLIC_URL=https://<your-production-domain> \
  node --env-file=.env.local scripts/qstash-schedules.mjs brief
node --env-file=.env.local scripts/qstash-schedules.mjs list
```

The brief fires at `CLAUDIO_BRIEF_TIME` (default `08:00`) in
`CLAUDIO_TIME_ZONE`. Messages go to `TELEGRAM_OWNER_CHAT_ID`, or to the first
id in `TELEGRAM_ALLOWED_USER_IDS`.

QStash cannot reach `localhost`, so under `eve dev` reminders are stored but
only delivered by a deployment whose `CLAUDIO_PUBLIC_URL` (or
`VERCEL_PROJECT_PRODUCTION_URL`) points at it.
