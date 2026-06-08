# AI Radio Show Builder

Turn any topic, URL, GitHub repo, or research source into a polished AI-generated radio show — complete with a customizable host, call-in guests, background music, optional radio production features, and a timecoded transcript.

Built with **React + Vite**, an **Express** API, and a **Gemini Managed Agent** pipeline that researches content, writes scripts, generates speech and music, mixes audio, and produces show metadata and cover art.

## Features

- **Show generation** from a text prompt (topic, duration, mood)
- **Show format presets** — Tech Debate, Roundtable Chill, Deep Interview, Explainer Hour, Late Night Labs, Call-In Hotline
- **Advanced customization** — host name, voice, persona, delivery; guest mode and count; show style; music mood; toggleable radio features (station ID, phone SFX, stingers, listener mail, and more)
- **Guest roster editor** — define fixed or guided guest profiles when using advanced guest modes
- **Show library** — play pre-built and user-generated shows with transcript sync
- **Production Director** — script review and audio quality checks ensure credible pacing and loudness regardless of user settings
- **Optional sharing** via Google Cloud Storage (when configured)

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS recommended)
- A [Gemini API key](https://aistudio.google.com/apikey) for show generation

For the agent pipeline (Python skills), the managed agent environment installs dependencies automatically. Local Python work requires the packages listed in [`agent/requirements.txt`](agent/requirements.txt).

## Run locally

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create `.env.local` (see [Environment variables](#environment-variables)):

   ```bash
   cp .env.example .env.local
   ```

   Set `GEMINI_API_KEY` to your Gemini API key.

3. Start the dev server:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000)

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start Express + Vite dev server (port 3000) |
| `npm run build` | Build frontend and bundle server for production |
| `npm run start` | Run production server (`dist/server.cjs`) |
| `npm run lint` | TypeScript type check |
| `npm run test:e2e` | Playwright smoke tests (starts dev server if needed) |
| `npm run test:e2e:ui` | Playwright interactive UI mode |
| `npm run clean` | Remove `dist/` |

## Review protocol

Before handing off changes, run:

```bash
npm run lint && npm run build && npm run test:e2e
```

Playwright smoke tests in [`e2e/show-generator.spec.ts`](e2e/show-generator.spec.ts) cover:

- Home page and generate form
- Form field `id` / `name` attributes (autofill and accessibility)
- Advanced panel and preset selection
- Library playback controls

Generation against the live Gemini API is not exercised in E2E tests to avoid quota usage.

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes (for generation) | Gemini API key |
| `NODE_ENV` | No | `development` (default) skips daily quota; `production` enforces it |
| `DAILY_QUOTA_LIMIT` | No | Max shows per user per day in production (default: 3) |
| `GCS_BUCKET_NAME` | No | Enables show sharing via Google Cloud Storage |

Copy [`.env.example`](.env.example) to `.env.local` and fill in values as needed.

## Project structure

```
├── src/                    # React frontend
│   ├── App.tsx             # Main UI (generator, player, library)
│   ├── showConfig.ts       # ShowConfig schema, presets, mood mapping
│   └── components/         # Transcript, GuestRosterEditor, etc.
├── server.ts               # Express API, agent orchestration, SSE streaming
├── server/lib/             # Agent client, show config prompt builder
├── agent/                  # Gemini Managed Agent definition
│   ├── AGENTS.md           # Agent workflow and pipeline docs
│   └── skills/             # Research, script, TTS, music, mixing, production
├── e2e/                    # Playwright smoke tests
├── public/shows/           # Pre-built example shows
└── playwright.config.ts
```

## How generation works

1. The UI sends a topic, duration, mood, and optional `ShowConfig` (from presets + Advanced settings) to `POST /api/generate-show`.
2. The server validates config with Zod, injects `show_config.json` into the agent workspace, and streams progress via SSE.
3. The agent runs a 10-step pipeline: research → script → script review → TTS → music → SFX → mix → quality check → metadata → cover image.
4. The final `show_notes.json`, `ai_radio.mp3`, and `cover.png` are returned to the browser.

See [`agent/AGENTS.md`](agent/AGENTS.md) for the full agent workflow, production rules, and skill reference.

## Customization

Show settings are defined in [`src/showConfig.ts`](src/showConfig.ts) and passed through the API as `ShowConfig`:

- **Host** — name, persona, accent, Gemini voice, delivery style
- **Guests** — auto, guided, or fixed roster
- **Structure** — debate, roundtable, interview, or explainer; optional segments (cold open, recap, news flash, etc.)
- **Features** — station ID, phone connect SFX, topic stingers, co-host, field reporter, mock sponsor, listener mail, and more
- **Music** — chill, tech, or debate mood; can be disabled

Advanced settings persist in `localStorage` between sessions.

## Production deployment

```bash
npm run build
NODE_ENV=production npm run start
```

Ensure `GEMINI_API_KEY` and any Firebase / GCS credentials are set in the deployment environment. Firebase auth and daily quotas apply when `NODE_ENV=production`.
