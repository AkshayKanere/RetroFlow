# RetroBoard

A real-time collaborative retrospective meeting tool for agile teams. Participants add points, vote, and discuss sprint outcomes on a shared board with anonymous contributions and AI-powered summaries.

## Features

- **3-Column Board** - What Went Well, What Didn't Go Well, Action Items
- **Real-time Collaboration** - Multiple participants via shared link using Socket.IO
- **Anonymous Cards** - Points are posted without attribution
- **Voting** - 3 votes per person, distributed across any cards
- **Duplicate Grouping** - Facilitator can drag-and-drop to merge similar cards
- **Timed Phases** - Configurable timers for adding points and voting
- **AI Summary** - 2-sentence retrospective summary via LLM Gateway
- **Facilitator Controls** - Start/end phases, group cards, generate summary

## Tech Stack

- **Frontend:** React 18, Vite, React Router, Socket.IO Client
- **Backend:** Node.js, Express, Socket.IO
- **Database:** SQLite (sql.js - pure JS, no native compilation)
- **LLM:** LLM Gateway (OpenAI-compatible API)

## Setup

### Prerequisites

- Node.js 20+

### Installation

```bash
git clone <repo-url>
cd RetrospectiveTool
npm install
cd server && npm install
cd ../client && npm install
cd ..
```

### Environment Variables

Copy `.env.example` to `.env` and fill in your values:

```
LLM_GATEWAY_URL=your-llm-gateway-url-here
LLM_API_KEY=your-api-key
LLM_MODEL=quick-thinking
PORT=3001
```

### Build & Run

```bash
npm run build        # Build React client
npm run dev:server   # Start server at http://localhost:3001
```

For development with hot reload:

```bash
npm run dev          # Runs server + Vite dev server concurrently
```

### Run Tests

```bash
npm test
```

## Usage

1. Open http://localhost:3001
2. Create a new retrospective (set title and timer durations)
3. Share the link with your team
4. Participants join by entering a display name

### Session Flow

| Phase | Who Controls | Description |
|-------|-------------|-------------|
| Lobby | Facilitator | Everyone joins, facilitator starts when ready |
| Adding Points | Timer (configurable) | All participants add cards to any column |
| Grouping | Facilitator | Facilitator drags cards to merge duplicates |
| Voting | Timer (configurable) | Everyone gets 3 votes |
| Discussion | Facilitator | Cards sorted by votes, facilitator generates AI summary |

## Project Structure

```
RetrospectiveTool/
  client/                   # React app (Vite)
    src/
      components/           # Board, Card, Column, Header, Timer, etc.
      context/              # SocketContext, RetroContext (state management)
  server/
    handlers/               # retroHandler, cardHandler, voteHandler, phaseHandler
    services/               # llmService (LLM Gateway integration)
    db.js                   # SQLite schema and queries (sql.js)
    index.js                # Express + Socket.IO server
    tests/                  # Vitest test suites
```
