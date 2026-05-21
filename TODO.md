# RetroBoard - TODO / Progress Tracker

**Last Updated:** 2026-05-20 (Round 3 - AI Features)

---

## Completed

- [x] **Fix critical Bug #1** — `Summary.jsx` rendered DB object instead of string, crashing the app after auto-summary. Fixed server to emit `summary.text`, added defensive client rendering.
- [x] **Fix Summary.md export crash** — `exportHandler.js` crashed with "Cannot read properties of undefined (reading 'title')" when retro not found. Added null checks.
- [x] **Remove hardcoded PII** — Removed personal email and unique ID from LLM request headers in `llmService.js` and `exportHandler.js`.
- [x] **Restrict CORS** — Changed from `origin: '*'` to `process.env.CORS_ORIGIN || 'http://localhost:5173'`.
- [x] **Add server-side input validation** — Card text (max 500), column (must be well/didnt/action), display name (max 50), retro title (max 100).
- [x] **Fix stale closure in Board.jsx** — `onRetroEnded` used `state.retro?.share_code` from stale closure. Switched to `useParams()`.
- [x] **Fix Column.jsx null crash** — Added optional chaining for `state.retro?.phase`.
- [x] **Fix unhandled promises** — Added `.catch()` to fetch chains in `HomePage.jsx`, `FinalSummary.jsx`, and clipboard API in `CreateRetro.jsx`.
- [x] **Add client input length limits** — `maxLength` on title (100), card text (500), display name (50), `max` on number inputs (60).
- [x] **Add 34 integration tests** — `server/tests/integration.test.js` covering full lifecycle, multi-participant, edge cases.
- [x] **Add 6 multi-retro persistence tests** — Verify multiple ended retros preserved in DB and retrievable via `getAllRetros`.
- [x] **Card sorting by vote count** — Cards now sorted by votes during voting AND discussion phases (was only discussion).
- [x] **FinalSummary cards sorted by votes** — Cards in each column sorted highest-votes-first on the summary page.
- [x] **Participant info in LLM prompts** — `buildPrompt` and `buildDetailedSummaryPrompt` now include participant count and names. Cards sorted by votes in prompts.
- [x] **Participant section in FinalSummary** — Summary page now shows "PARTICIPANTS (N)" section with names.
- [x] **Add 4 new LLM prompt tests** — Verify participant info, vote-sorted cards in prompts.
- [x] **Multi-user E2E test script** — `server/tests/multiuser-e2e.mjs` — 10 concurrent Socket.IO users, 22 test steps, all pass.
- [x] **Session persistence for rejoin** — Save `retroSession` to `sessionStorage` on join. Board auto-rejoins on mount. JoinForm auto-redirects if session exists.
- [x] **Server rejoin-retro event** — New socket event accepts `participantId`, updates socket_id, returns full state.
- [x] **Preserve participant on disconnect** — Changed disconnect handler to clear `socket_id` instead of deleting participant row, enabling rejoin.
- [x] **React Error Boundary** — Added `ErrorBoundary.jsx` class component wrapping the app. Shows user-friendly error page with "Go Home" and "Try Again" buttons.
- [x] **404 catch-all route** — Added `NotFound.jsx` component and `<Route path="*">` catch-all in `App.jsx`.
- [x] **Rate limiting** — Added in-memory rate limiter (`server/services/rateLimiter.js`). REST: 100 req/min per IP. Login: 5 req/min per IP. Socket: 30 events/min per socket.
- [x] **Facilitator token expiry** — Changed `validTokens` from Set to Map with timestamps. Tokens expire after 24 hours. Hourly cleanup sweeps stale tokens.
- [x] **Accessibility improvements** — Added ARIA labels on all buttons/inputs, `htmlFor`/`id` on all label/input pairs across 10 components.
- [x] **Timer "Time's up" message** — Timer now shows pulsing "Time's up!" notification for 5 seconds at 0 instead of disappearing.
- [x] **Socket cleanup on unmount** — Added `useEffect` cleanup in `SocketContext` to call `socket.disconnect()` on unmount.
- [x] **Persistent database** — Added `loadDbFromFile`/`saveDbToFile` to `db.js`. Set `DB_PATH` env var to enable file-based persistence with 30s auto-save and graceful shutdown save.

- [x] **Feature 1: Section summaries + combined summary above sections** — Each column shows an AI-generated 1-sentence summary above its cards. Combined summary moved above all columns in `Board.jsx`. Summaries only generated after voting ends (discussion phase) to avoid unnecessary LLM calls during adding/grouping/voting phases. Auto-summary triggered on phase transition to discussion.
- [x] **Feature 2: Grouped cards show complete content** — `GroupBadge.jsx` no longer uses expand/collapse. All child card texts are always visible by default.
- [x] **Feature 3: AI-powered auto-grouping with facilitator approval** — "AI Auto-Group" button in Header during grouping phase. Emits `suggest-groupings` socket event per column, LLM identifies duplicate/similar cards. Approval modal shows suggestions with parent/child/reason. "Approve All" applies groupings via `apply-groupings` socket event.
- [x] **Feature 4: AI rephrase button** — "AI" button next to Add button in `Column.jsx` (visible when text entered). Calls `POST /api/rephrase`, replaces input with improved text.
- [x] **Feature 5: AI suggested action items** — `FinalSummary.jsx` auto-fetches from `POST /api/retros/:id/action-items` on load. Shows "AI SUGGESTED ACTION ITEMS" section between AI Summary and card columns.
- [x] **AI Features E2E test** — `server/tests/ai-features-e2e.mjs` — 34 tests covering all 5 features, all pass.
- [x] **Browser E2E test (all 5 AI features)** — Chrome CDP automation on port 9222 with non-default profile. Full lifecycle: facilitator login → create retro → join → add cards with AI rephrase → verify section/combined summaries → AI auto-group with approval modal → verify grouped cards full content → vote → end retro → verify AI action items on summary page. ALL 5 FEATURES PASS.

## In Progress

(none)

## Pending

- [ ] **E2E test: rejoin from new tab** — Server restarted with rejoin support. Need to run full E2E test: join retro → navigate away → come back → verify board loads with state intact.
- [ ] **E2E test: duplicate card grouping** — Full test of drag-and-drop grouping, multi-child groups, ungroup, permission checks, cross-phase behavior.
- [ ] **E2E test: multiple ended retros on homepage** — Create 3+ retros, end each, verify all appear in Past Retrospectives table with action buttons.

---

## Test Counts

| Category | Count | Status |
|----------|-------|--------|
| Unit tests (Vitest) | 105 | ALL PASS |
| E2E manual test cases | 55 | ALL PASS |
| Multi-user E2E (10 users) | 22 | ALL PASS |
| AI Features E2E | 34 | ALL PASS |
| Browser E2E (AI features) | 5 features | ALL PASS |
| **Total** | **216 + browser** | **ALL PASS** |

## Files Modified (from original)

| File | Changes |
|------|---------|
| `server/index.js` | Input validation, CORS restriction, participant info in summaries, rejoin-retro event, disconnect preserves participant, rate limiting, DB persistence, rephrase/section-summary/action-items REST endpoints, suggest-groupings/apply-groupings socket events |
| `server/db.js` | Added `getParticipant`, `updateParticipantSocket`, `disconnectParticipantBySocket`, `loadDbFromFile`, `saveDbToFile` |
| `server/services/llmService.js` | Removed PII headers, added participants param, cards sorted by votes in prompts, added `callLLM` helper, `generateSectionSummary`, `rephraseText`, `suggestGroupings`, `generateActionItems` |
| `server/services/rateLimiter.js` | New: in-memory rate limiter with sliding window |
| `server/handlers/exportHandler.js` | Removed PII headers, added null checks, pass participants to prompt |
| `server/handlers/facilitatorHandler.js` | Token expiry (24h TTL), hourly cleanup of stale tokens |
| `client/src/App.jsx` | Added ErrorBoundary wrapper, 404 catch-all route |
| `client/src/components/ErrorBoundary.jsx` | New: React error boundary with themed error page |
| `client/src/components/NotFound.jsx` | New: 404 page with themed styling |
| `client/src/components/Summary.jsx` | Defensive rendering for object vs string |
| `client/src/components/Board.jsx` | Added `useParams`, fixed stale closure, auto-rejoin on mount, moved Summary above columns |
| `client/src/components/Column.jsx` | Vote sorting during voting phase, null check, maxLength, ARIA labels, section summary display, AI rephrase button |
| `client/src/components/Card.jsx` | ARIA labels on vote button and card container |
| `client/src/components/Header.jsx` | ARIA labels on all phase-control buttons, AI Auto-Group button with approval modal |
| `client/src/components/Timer.jsx` | "Time's up!" notification with pulse animation at timer end |
| `client/src/components/FinalSummary.jsx` | Cards sorted by votes, participants section, catch handler, ARIA labels, AI Suggested Action Items section |
| `client/src/components/HomePage.jsx` | Added `.catch()` handler, ARIA labels |
| `client/src/components/CreateRetro.jsx` | maxLength, max on numbers, clipboard catch, htmlFor/id pairs, ARIA labels |
| `client/src/components/JoinForm.jsx` | Session persistence, auto-redirect on rejoin, htmlFor/id pairs, ARIA labels |
| `client/src/components/FacilitatorLogin.jsx` | htmlFor/id pairs, ARIA labels |
| `client/src/context/SocketContext.jsx` | Socket disconnect on unmount |
| `server/tests/integration.test.js` | 40 tests (34 original + 6 multi-retro) |
| `server/tests/llmService.test.js` | 9 tests (5 original + 4 new) |
| `server/tests/multiuser-e2e.mjs` | New: 10-user E2E test script |
| `server/tests/ai-features-e2e.mjs` | New: 34-test AI features E2E script |
| `client/src/components/GroupBadge.jsx` | Removed expand/collapse, always show full child card content |
| `.env.example` | Added `DB_PATH=` |

## Bugs Fixed

| # | Severity | Summary |
|---|----------|---------|
| 1 | Critical | App crash on auto-summary (object rendered as React child) |
| 2 | High | Summary.md export crash on missing retro |
| 3 | High | Hardcoded PII in LLM headers |
| 4 | High | CORS wide open (`origin: '*'`) |
| 5 | High | No server-side input validation |
| 6 | High | Stale closure in Board.jsx onRetroEnded |
| 7 | Medium | Column.jsx crash if state.retro is null |
| 8 | Medium | Unhandled promise rejections |
| 9 | Medium | Clipboard API fails silently |
| 10 | Medium | No input length limits |
| 11 | Medium | Cards not sorted by votes during voting phase |
| 12 | Medium | FinalSummary cards not sorted by votes |
| 13 | Medium | No participant info in LLM summaries |
| 14 | Medium | No session persistence (user must rejoin on refresh/new tab) |
| 15 | Medium | Participant deleted on disconnect (prevents rejoin) |
