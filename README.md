# RetroFlow

A real-time collaborative retrospective meeting tool for agile teams. Participants add points, vote, and discuss sprint outcomes on a shared board with anonymous contributions and AI-powered summaries.

## Features

- **3-Column Board** - What Went Well, What Didn't Go Well, Action Items
- **Real-time Collaboration** - Multiple participants via shared link using Socket.IO
- **Anonymous Cards** - Points are posted without attribution
- **Voting** - 3 votes per person, distributed across any cards
- **Duplicate Grouping** - Facilitator can drag-and-drop to merge similar cards; AI auto-grouping available
- **Timed Phases** - Configurable timers for adding points and voting
- **AI Summary** - 2-sentence retrospective summary via any OpenAI-compatible LLM Gateway
- **AI Rephrase** - Improve card text clarity with one click
- **AI Action Items** - Auto-generated action items from retrospective data
- **Facilitator Controls** - Start/end phases, group cards, generate summary, end retro
- **Export** - Download retro data as Excel or AI-generated markdown summary
- **Persistence** - SQLite database survives server restarts
- **Graceful Degradation** - All core features work without LLM; AI features are simply hidden
- **Debug Logging** - Structured log levels (debug/info/warn/error) with timestamps

## Tech Stack

- **Frontend:** React 18, Vite, React Router, Socket.IO Client
- **Backend:** Node.js, Express, Socket.IO
- **Database:** SQLite (sql.js - pure JS, no native compilation)
- **LLM:** Any OpenAI-compatible API (optional)

## Setup

### Prerequisites

- Node.js 20+

### Installation

```bash
git clone https://github.com/AkshayKanere/RetroFlow.git
cd RetroFlow
cd server && npm install
cd ../client && npm install
cd ..
```

### Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```
LOG_LEVEL=info
LLM_GATEWAY_URL=your-llm-gateway-url-here
LLM_API_KEY=your-api-key
LLM_MODEL=quick-thinking
PORT=3001
FACILITATOR_PASSWORD=your-secret-password
DB_PATH=./data/retro.db
LLM_USER_AGENT=RetroFlow/1.0.0
LLM_EXTRA_HEADERS=
```

| Variable | Required | Description |
|----------|----------|-------------|
| `LLM_GATEWAY_URL` | No | OpenAI-compatible chat completions endpoint |
| `LLM_API_KEY` | No | API key for the LLM gateway |
| `LLM_MODEL` | No | Model name (default: `quick-thinking`) |
| `PORT` | No | Server port (default: `3001`) |
| `FACILITATOR_PASSWORD` | Yes | Password to create/manage retros |
| `DB_PATH` | No | SQLite file path for persistence (default: in-memory) |
| `LOG_LEVEL` | No | Minimum log level: `debug`, `info`, `warn`, `error` (default: `info`) |
| `LLM_USER_AGENT` | No | User-Agent header for LLM requests (default: `RetroFlow/1.0.0`) |
| `LLM_EXTRA_HEADERS` | No | JSON object of additional headers for LLM requests, e.g. `{"x-custom":"value"}` |

> **Note:** If `LLM_GATEWAY_URL` and `LLM_API_KEY` are not set, the app works normally — AI features (summary, rephrase, auto-group, action items) are simply hidden from the UI.

### Build & Run

```bash
# Build the React client
cd client && npx vite build && cd ..

# Start the server (serves both API and client)
cd server && node --env-file=../.env index.js
```

Or use the batch files (Windows):

```
start-server.bat      # Start the server
stop-server.bat       # Stop the server (kills process on port 3001)
restart-server.bat    # Stop + start
```

For development with hot reload:

```bash
npm run dev          # Runs server + Vite dev server concurrently
```

### Run Tests

```bash
cd server && npx vitest run
```

## Usage

1. Open http://localhost:3001
2. Log in as facilitator with your configured password
3. Create a new retrospective (set title and timer durations)
4. Share the link with your team
5. Participants join by entering a display name

### Session Flow

| Phase | Who Controls | Description |
|-------|-------------|-------------|
| Lobby | Facilitator | Everyone joins, facilitator starts when ready |
| Adding Points | Timer (configurable) | All participants add cards to any column |
| Grouping | Facilitator | Facilitator merges duplicates (manual or AI auto-group) |
| Voting | Timer (configurable) | Everyone gets 3 votes |
| Discussion | Facilitator | Cards sorted by votes, AI summary generated |
| Ended | - | Final summary page with AI action items, export options |

## Project Structure

```
RetroFlow/
  client/                     # React app (Vite)
    src/
      components/             # Board, Card, Column, Header, Timer, Summary, etc.
      context/                # SocketContext, RetroContext (state management)
  server/
    handlers/                 # retroHandler, cardHandler, voteHandler, phaseHandler, exportHandler
    services/                 # llmService (LLM integration), logger, rateLimiter
    db.js                     # SQLite schema and queries (sql.js)
    index.js                  # Express + Socket.IO server
    tests/                    # Vitest unit + integration tests
  start-server.bat            # Start server (Windows)
  stop-server.bat             # Stop server (Windows)
  restart-server.bat          # Restart server (Windows)
  .env.example                # Environment variable template
```

## Deployment

The server serves both the API/WebSocket and the built client static files from `client/dist/` on a single port. No separate client server is needed in production.

1. Build the client: `cd client && npx vite build`
2. Set environment variables
3. Start the server: `cd server && node --env-file=../.env index.js`

Use a process manager like `pm2` for production: `pm2 start server/index.js`
