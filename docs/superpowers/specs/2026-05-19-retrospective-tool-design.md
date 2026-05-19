# Retrospective Meeting Tool - Design Spec

## Overview

A real-time collaborative retrospective board where team members add points, vote, and discuss sprint outcomes. Features include anonymous participation, facilitator-controlled timed phases, duplicate grouping, and AI-powered summaries via KPIT LLM Gateway.

## Tech Stack

- **Frontend:** React (Vite)
- **Backend:** Node.js + Express
- **Real-time:** Socket.IO
- **Database:** SQLite
- **LLM:** KPIT LLM Gateway

## Architecture

Monolith: single Express server serves the React static files, REST API, and Socket.IO connections. SQLite for persistence.

## Retro Format

Three columns:
- **What Went Well** (teal)
- **What Didn't Go Well** (red)
- **Action Items** (purple)

## User Flow & Session Management

### Creating a Retro

1. Facilitator clicks "New Retrospective"
2. Enters title, configures durations:
   - Add points phase (default: 10 min)
   - Voting phase (default: 10 min)
3. Gets a shareable link (e.g., `/retro/abc123`)

### Joining a Retro

1. Participant opens the shared link
2. Enters a display name (used for presence indicator only; cards are anonymous)
3. Joins the board and sees all existing cards in real-time

### Session Phases (Facilitator-Controlled)

1. Everyone joins via link. Board is open but timers haven't started.
2. **Facilitator clicks "Start Adding Points"** — timer begins, everyone can add cards to any column.
3. Timer expires (or facilitator ends early) — adding is locked.
4. **Facilitator groups duplicates** — only the facilitator can do this. No timer; facilitator proceeds when done.
5. **Facilitator clicks "Start Voting"** — timer begins, everyone gets 3 votes distributed across any cards/columns.
6. Timer expires (or facilitator ends early) — voting is locked.
7. Cards sort by vote count (highest first) for discussion.
8. **Facilitator clicks "Generate Summary"** — LLM produces a 2-sentence summary.

## Board Layout

### Top Bar
- App logo ("RetroBoard") + session title
- Participant count
- "Generate Summary" button (facilitator only, discussion phase)
- Remaining votes counter (per user)
- Phase controls (facilitator only): start timer buttons, end phase early

### Columns
- Three equal-width columns, each color-coded
- Column header with name and card count badge
- Cards displayed as sticky notes with:
  - Anonymous text
  - Upvote arrow with vote count
  - "Grouped (N)" badge when duplicates are merged
- "+ Add a point" dashed button at the bottom of each column (disabled when not in adding phase)

### AI Summary Bar
- Collapsible panel at the bottom of the board
- Shows the 2-sentence LLM summary after generation
- Can be regenerated

### Timer Display
- Visible countdown timer when a timed phase is active
- Shows phase name and remaining time

## Data Model

### retros
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT (UUID) | Primary key |
| title | TEXT | Session title |
| share_code | TEXT | Unique, used in shareable URL |
| add_points_duration | INTEGER | Seconds, default 600 |
| voting_duration | INTEGER | Seconds, default 600 |
| phase | TEXT | One of: waiting, adding, grouping, voting, discussion |
| phase_ends_at | TEXT | ISO timestamp, null when no timer active |
| created_at | TEXT | ISO timestamp |

### participants
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT (UUID) | Primary key |
| retro_id | TEXT | FK to retros |
| display_name | TEXT | Shown in presence indicator |
| socket_id | TEXT | Current Socket.IO connection |
| is_facilitator | BOOLEAN | True for retro creator |

### cards
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT (UUID) | Primary key |
| retro_id | TEXT | FK to retros |
| column | TEXT | One of: well, didnt, action |
| text | TEXT | Card content |
| group_id | TEXT | Nullable, FK to cards.id (parent card) |
| created_at | TEXT | ISO timestamp |

### votes
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT (UUID) | Primary key |
| card_id | TEXT | FK to cards |
| participant_id | TEXT | FK to participants |
| UNIQUE | | (card_id, participant_id) — no double-voting same card |

Vote count per participant per retro enforced in application logic (max 3).

### summaries
| Column | Type | Notes |
|--------|------|-------|
| id | TEXT (UUID) | Primary key |
| retro_id | TEXT | FK to retros |
| text | TEXT | 2-sentence summary |
| created_at | TEXT | ISO timestamp |

## Real-time Events (Socket.IO)

### Client -> Server

| Event | Payload | Who |
|-------|---------|-----|
| join-retro | { shareCode, displayName } | Everyone |
| add-card | { column, text } | Everyone (adding phase) |
| vote-card | { cardId } | Everyone (voting phase) |
| unvote-card | { cardId } | Everyone (voting phase) |
| group-cards | { parentCardId, childCardId } | Facilitator only |
| ungroup-card | { cardId } | Facilitator only |
| start-phase | { phase } | Facilitator only |
| end-phase | {} | Facilitator only |
| generate-summary | {} | Facilitator only |

### Server -> Client (broadcast)

| Event | Payload |
|-------|---------|
| retro-state | Full board state (sent on join) |
| card-added | { card } |
| card-voted | { cardId, voteCount } |
| card-unvoted | { cardId, voteCount } |
| cards-grouped | { parentCard, childCardId } |
| card-ungrouped | { card } |
| phase-changed | { phase, endsAt } |
| timer-expired | { phase } |
| participant-joined | { participant, count } |
| participant-left | { participantId, count } |
| summary-generated | { text } |

## Duplicate Grouping

- Facilitator-only action during the grouping phase
- Facilitator drags a card onto another card to merge them
- Child card gets `group_id` set to the parent card's id
- Child cards are hidden; parent card shows "grouped (N)" badge
- Clicking the badge expands to show original texts of all grouped cards
- Facilitator can ungroup via an ungroup button on expanded view
- Vote counts on grouped cards are combined (votes on children transfer to parent)

## LLM Summary

- Facilitator clicks "Generate Summary" during discussion phase
- Server collects all cards with vote counts across all 3 columns
- Sends prompt to KPIT LLM Gateway:
  ```
  Summarize this sprint retrospective in exactly 2 sentences.
  What Went Well: [cards with votes]
  What Didn't Go Well: [cards with votes]
  Action Items: [cards with votes]
  ```
- Response displayed in AI Summary bar at bottom
- Can be regenerated
- KPIT LLM Gateway endpoint and API key are configured via environment variables (`LLM_GATEWAY_URL`, `LLM_API_KEY`)

## Project Structure

```
RetrospectiveTool/
  client/                  # React app (Vite)
    src/
      components/
        Board.jsx          # Main 3-column board
        Card.jsx           # Individual card component
        Column.jsx         # Column with cards list
        Header.jsx         # Top bar (title, participants, timer, controls)
        JoinForm.jsx       # Enter display name
        CreateRetro.jsx    # New retro form (title, timer config)
        Summary.jsx        # AI summary panel
        GroupBadge.jsx     # Expanded grouped cards view
        Timer.jsx          # Countdown timer display
      context/
        SocketContext.jsx   # Socket.IO connection provider
        RetroContext.jsx    # Board state management
      App.jsx
      main.jsx
  server/
    index.js               # Express + Socket.IO setup
    db.js                   # SQLite connection + schema
    handlers/
      retroHandler.js      # CRUD for retros
      cardHandler.js       # Card add/group/ungroup logic
      voteHandler.js       # Vote logic with 3-vote limit
      phaseHandler.js      # Phase transitions + timer management
    services/
      llmService.js        # KPIT LLM Gateway integration
  package.json             # Root with workspaces or scripts for both
```

## Anonymity

- Cards are anonymous by default — no attribution shown
- Display names are used only for the participant presence indicator in the header
- The server never broadcasts which participant created which card

## Key Constraints

- 3 votes per person per retro, distributed across any cards/columns
- No double-voting on the same card
- Only facilitator can: group/ungroup cards, start/end phases, generate summary
- Timers are configurable at retro creation time
- Facilitator can end timed phases early
