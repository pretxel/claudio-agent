# claudio-agent

Personal assistant built on the [eve](https://eve.dev) framework. A root
orchestrator answers directly, reads your Google Calendar and Gmail, and
delegates heavier work to three specialist subagents. All models route through
[OpenRouter](https://openrouter.ai), and you talk to the agent over Telegram.

## How it works

```
Telegram bot ──▶ Claudio ──▶ researcher   (facts, options, references)
                    │    ──▶ planner      (goal → ordered plan with dates)
                    │    ──▶ summarizer   (long material → short brief)
                    │
                    └──▶ Google Calendar + Gmail tools
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
│   └── google.ts                # Google OAuth token minting + REST helpers
├── tools/
│   ├── agent.ts                 # Disables the built-in self-copy tool
│   ├── calendar_list_events.ts  # Read events in a time window
│   ├── calendar_create_event.ts # Create an event
│   ├── gmail_search.ts          # Gmail query syntax search
│   └── gmail_read_message.ts    # Read one message body
├── channels/
│   ├── telegram.ts              # Telegram bot channel
│   └── eve.ts                   # Default HTTP/TUI channel (local dev + TUI)
└── subagents/
    ├── researcher/
    ├── planner/
    └── summarizer/
scripts/google-auth.mjs          # One-time helper to mint a Google refresh token
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

## Telegram webhook

eve mounts the webhook at `POST /eve/v1/telegram` but does not register it.
After deploying, register it yourself:

```bash
curl -X POST "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://your-app.example.com/eve/v1/telegram",
       "secret_token":"'"$TELEGRAM_WEBHOOK_SECRET_TOKEN"'",
       "allowed_updates":["message","callback_query"]}'
```

In private chats every message reaches the agent. In groups the bot only wakes
on a command, an @-mention, or a reply to one of its own messages.

## Production notes

- The bot speaks for your Google account. Anyone who can message it can read
  your mail — restrict the bot to your own chat id before exposing it.
- `agent/channels/eve.ts` ships with scaffold `placeholderAuth()` — replace it
  with a real auth provider before exposing the HTTP route publicly.
- `npm run build` / `npm start` for production build and serve.
