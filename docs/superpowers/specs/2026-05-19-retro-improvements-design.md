# Retrospective Tool Improvements — Design Spec

**Date:** 2026-05-19
**Status:** Approved

## Overview

A set of improvements to the RetroBoard application covering: auto-generated summaries, facilitator authentication, streamlined join flow, end-retro workflow, export capabilities, max participants, and server logging.

---

## 1. Home Page (`/`) — Sprint List Dashboard

**Replaces** the current create-only form.

### Regular Users
- Fetches `GET /api/retros` on load
- Shows a list of all retros sorted by creation date (newest first)
- Each row: title, date, phase badge (active/ended)
- **Active retro**: "Join" button — navigates to `/retro/:shareCode` (name entry form)
- **Ended retros**: "View Summary" link, "Export Excel" button, "Export Summary.md" button (hidden if LLM not configured)
- No "Create New Retro" option

### Facilitator Login Link
- A "Facilitator Login" link in the header/corner of the home page
- Navigates to `/facilitator`

---

## 2. Facilitator Login (`/facilitator`)

- Password input form
- Password validated against `FACILITATOR_PASSWORD` environment variable in `.env`
- Server endpoint: `POST /api/facilitator/login` with `{ password }` body
  - Returns `{ token }` on success (simple signed token or base64-encoded hash)
  - Returns `{ error: 'Invalid password' }` on failure
- On success: store token in `sessionStorage` under key `facilitatorToken`
- Redirect to `/` (home page) where facilitator-only features are now visible:
  - "Create New Retro" button (disabled if an active retro exists)
- Facilitator token sent as `Authorization: Bearer <token>` header on protected API calls
- Server validates token on: `POST /api/retros`, `join-retro` with `isFacilitator: true`

---

## 3. Facilitator vs Regular User Roles

| Feature                        | Facilitator       | Regular User         |
|--------------------------------|-------------------|----------------------|
| Create retro                   | Yes               | No                   |
| Phase controls (start/end)     | Yes               | Hidden               |
| Timer                          | Start/stop        | Read-only countdown  |
| End Retrospective (header btn) | Yes, all phases   | Hidden               |
| Generate Summary (manual btn)  | Yes, discussion   | Hidden               |
| Add cards                      | Yes               | Yes                  |
| Vote                           | Yes               | Yes                  |
| See summary panel              | Yes               | Yes                  |
| Export buttons                  | Yes               | Yes                  |

### How Facilitator is Determined
- **Old behavior**: first person to join becomes facilitator (removed)
- **New behavior**: user who authenticated via `/facilitator` joins with `isFacilitator: true`
- Server validates facilitator token in `join-retro` handler before accepting `isFacilitator: true`
- Regular users always join as non-facilitator

---

## 4. Auto-Generated Summary (Debounced)

### Trigger
- On every `card-added` event, server resets a per-retro debounce timer (5 seconds)
- When timer fires: fetch all cards + votes, call `generateSummary()`, save to DB, broadcast `summary-generated` to all room members

### Visibility
- `<Summary />` panel visible in **all phases** (not just discussion), as long as `cards.length > 0`
- Panel shows "Generating summary..." while waiting for first generation

### Manual Override
- "Generate Summary" button remains for facilitator during discussion phase
- Triggers immediate LLM call (no debounce)

### Error Handling
- If LLM call fails, log error, do not broadcast — previous summary (if any) remains
- If LLM is not configured (`LLM_GATEWAY_URL` or `LLM_API_KEY` missing), skip auto-generation silently

---

## 5. End Retrospective

### Button
- "End Retrospective" button always visible in header bar, **facilitator only**, in **all phases**
- Red/destructive styling to indicate finality
- Click triggers a browser `confirm()` dialog: "End this retrospective? This cannot be undone."

### Server Handling
- New socket event: `end-retro`
- Server validates: caller is facilitator
- Sets `phase = 'ended'` on the retro
- Clears any active phase timer
- Broadcasts `retro-ended` to all room members

### Client Handling
- On `retro-ended` event: all participants redirected to `/retro/:shareCode/summary`
- Final Summary page (new route): read-only view with retro title, AI summary, all cards organized by column with vote counts

---

## 6. Single Active Retro Enforcement

- `POST /api/retros` checks: if any retro has `phase != 'ended'`, return `400 { error: 'An active retro already exists' }`
- Home page: "Create New Retro" button disabled with tooltip if active retro exists

---

## 7. Max Participants

### Create Form
- New field: "Max Participants" (number input, default: 10, min: 2)

### Database
- New column on `retros` table: `max_participants INTEGER NOT NULL DEFAULT 10`

### Server Enforcement
- On `join-retro`: count current participants for the retro
- If count >= `max_participants`, return `{ error: 'Retro is full. Maximum participants reached.' }`
- Facilitator counts toward the limit

### UI
- Header bar shows participant count as: "3/10 participants"

---

## 8. Export: Excel

### Endpoint
- `GET /api/retros/:id/export/excel`
- Returns `.xlsx` file download

### Contents (4 sheets)
1. **Cards**: Column, Text, Vote Count, Group (parent card text if grouped)
2. **Participants**: Display Name, Is Facilitator
3. **Summary**: Summary text, Generated date
4. **Votes**: Card Text, Card Column, Voter Display Name

### Library
- `xlsx` (SheetJS) — pure JavaScript, no native dependencies

### Availability
- Available for ended retros only
- No authentication required (anyone with the link can export)

---

## 9. Export: Summary.md (LLM-powered)

### Endpoint
- `GET /api/retros/:id/export/summary`
- Returns `summary.md` file download

### Availability
- **Only available** if `LLM_GATEWAY_URL` and `LLM_API_KEY` are configured
- Button hidden on frontend if LLM is not available
- New endpoint: `GET /api/config` returns `{ llmConfigured: true/false }` (no secrets exposed)

### LLM Prompt
Sends all cards (by column) with vote counts to LLM with instruction to generate detailed markdown:

### Generated Sections
1. **Overview** — what the retro covered
2. **Key Themes** — patterns across all cards
3. **Top Voted Items** — highest voted cards with context
4. **Action Items** — from action column, prioritized by votes
5. **Trends & Observations** — cross-cutting insights
6. **Recommendations** — suggested next steps

### Error Handling
- If LLM call fails: return `500 { error: 'Failed to generate summary' }`
- Client shows error toast, no crash

---

## 10. API Endpoints

| Endpoint                          | Method | Auth Required      | Purpose                          |
|-----------------------------------|--------|--------------------|----------------------------------|
| `GET /api/retros`                 | GET    | No                 | List all retros                  |
| `POST /api/retros`               | POST   | Facilitator token  | Create retro                     |
| `POST /api/facilitator/login`    | POST   | No                 | Validate password, return token  |
| `GET /api/retros/:id/export/excel` | GET  | No                 | Download Excel export            |
| `GET /api/retros/:id/export/summary` | GET | No                | Download summary.md (LLM)       |
| `GET /api/config`                 | GET    | No                 | Returns LLM availability flag    |

## 11. Socket Events (Changes)

| Event              | Direction       | Changes                                              |
|--------------------|-----------------|-------------------------------------------------------|
| `join-retro`       | Client→Server   | Accepts `isFacilitator` flag + facilitator token      |
| `end-retro`        | Client→Server   | New event — facilitator ends retro                    |
| `retro-ended`      | Server→Clients  | New event — broadcasts to redirect all to summary     |
| `summary-generated`| Server→Clients  | Now also triggered by auto-generation (debounced)     |

---

## 12. Client Routes

| Route                        | Component       | Purpose                           |
|------------------------------|-----------------|-----------------------------------|
| `/`                          | HomePage        | Sprint list dashboard             |
| `/facilitator`               | FacilitatorLogin| Password login form               |
| `/retro/:shareCode`          | JoinForm        | Enter display name to join        |
| `/retro/:shareCode/board`    | Board           | Main retro board                  |
| `/retro/:shareCode/summary`  | FinalSummary    | Read-only final summary page      |

---

## 13. Server Logging

- `console.info` on: server start, `join-retro`, `add-card`, phase changes, summary generation triggered/completed, exports, facilitator login attempts
- `console.error` on: all catch blocks, LLM failures, auth failures, validation errors

---

## 14. Environment Variables

Add to `.env.example`:
```
FACILITATOR_PASSWORD=your-secret-password
```

Existing (unchanged):
```
LLM_GATEWAY_URL=your-llm-gateway-url-here
LLM_API_KEY=your-api-key-here
LLM_MODEL=quick-thinking
PORT=3001
```

---

## 15. New Dependencies

| Package | Purpose          | Location |
|---------|------------------|----------|
| `xlsx`  | Excel generation  | server   |
